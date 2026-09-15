import type { Pass, PassStatus, PassType, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isOwnerOrAdmin } from "./access";
import { RegistrationForbiddenError, RegistrationNotFoundError } from "./registration-service";

// Ticket Engine — Pass CRUD (2026-09-16). Управлять предложениями доступа
// (создавать/редактировать/менять статус) может только владелец события или
// ADMIN — тот же принцип, что и в team-service.ts (цены/инвентарь — не менее
// чувствительная зона, чем состав команды события).

export class PassValidationError extends Error {
  constructor(
    public code: string,
    message?: string
  ) {
    super(message ?? code);
  }
}

// Организатор вручную переключает только эти четыре значения. SOLD_OUT/ENDED
// вычисляются сервером (см. syncPassLifecycle) — тот же принцип, что и
// NO_SHOW в EventRegistration (нельзя присвоить вручную статус, который
// система вычисляет сама).
const ORGANIZER_SETTABLE_STATUSES: PassStatus[] = ["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"];

async function requireOwnerOrAdminEvent(eventId: string, user: User) {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw new RegistrationNotFoundError();
  if (!isOwnerOrAdmin(event, user)) throw new RegistrationForbiddenError("forbidden");
  return event;
}

async function requireOwnerOrAdminPass(passId: string, user: User) {
  const pass = await prisma.pass.findUnique({ where: { id: passId }, include: { event: true } });
  if (!pass) throw new RegistrationNotFoundError();
  if (!isOwnerOrAdmin(pass.event, user)) throw new RegistrationForbiddenError("forbidden");
  return pass;
}

export type PassInput = {
  name: string;
  description?: string | null;
  type: PassType;
  price?: number | null;
  currency?: string | null;
  quantity?: number | null;
  salesStartAt?: Date | null;
  salesEndAt?: Date | null;
  validFrom?: Date | null;
  validUntil?: Date | null;
  sortOrder?: number;
};

function validateCommon(input: Partial<PassInput>): void {
  if (input.name !== undefined && !input.name.trim()) {
    throw new PassValidationError("name_required", "Название обязательно.");
  }
  if (input.price != null && input.price < 0) {
    throw new PassValidationError("invalid_price", "Цена не может быть отрицательной.");
  }
  if (input.quantity != null && (!Number.isInteger(input.quantity) || input.quantity <= 0)) {
    throw new PassValidationError("invalid_quantity", "Количество мест должно быть положительным целым числом.");
  }
  if (input.salesStartAt && input.salesEndAt && input.salesStartAt > input.salesEndAt) {
    throw new PassValidationError("invalid_sales_window", "Дата начала продаж не может быть позже даты окончания продаж.");
  }
  if (input.validFrom && input.validUntil && input.validFrom > input.validUntil) {
    throw new PassValidationError("invalid_validity_window", "Начало действия не может быть позже окончания действия.");
  }
}

export async function createPass(eventId: string, user: User, input: PassInput): Promise<Pass> {
  await requireOwnerOrAdminEvent(eventId, user);
  validateCommon(input);

  return prisma.pass.create({
    data: {
      eventId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      type: input.type,
      price: input.price ?? null,
      currency: input.currency?.trim() || null,
      quantity: input.quantity ?? null,
      salesStartAt: input.salesStartAt ?? null,
      salesEndAt: input.salesEndAt ?? null,
      validFrom: input.validFrom ?? null,
      validUntil: input.validUntil ?? null,
      sortOrder: input.sortOrder ?? 0,
    },
  });
}

export async function updatePass(passId: string, user: User, patch: Partial<PassInput>): Promise<Pass> {
  const pass = await requireOwnerOrAdminPass(passId, user);
  validateCommon(patch);

  // Нельзя опустить лимит мест ниже уже проданного количества — иначе
  // availableQuantity ушёл бы в минус, а UI показывал бы "продано больше,
  // чем есть мест" как будто это нормально.
  if (patch.quantity !== undefined && patch.quantity != null && patch.quantity < pass.soldQuantity) {
    throw new PassValidationError(
      "quantity_below_sold",
      `Нельзя установить лимит меньше уже проданных билетов (продано: ${pass.soldQuantity}).`
    );
  }

  return prisma.pass.update({
    where: { id: passId },
    data: {
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.description !== undefined ? { description: patch.description?.trim() || null } : {}),
      ...(patch.type !== undefined ? { type: patch.type } : {}),
      ...(patch.price !== undefined ? { price: patch.price } : {}),
      ...(patch.currency !== undefined ? { currency: patch.currency?.trim() || null } : {}),
      ...(patch.quantity !== undefined ? { quantity: patch.quantity } : {}),
      ...(patch.salesStartAt !== undefined ? { salesStartAt: patch.salesStartAt } : {}),
      ...(patch.salesEndAt !== undefined ? { salesEndAt: patch.salesEndAt } : {}),
      ...(patch.validFrom !== undefined ? { validFrom: patch.validFrom } : {}),
      ...(patch.validUntil !== undefined ? { validUntil: patch.validUntil } : {}),
      ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
    },
  });
}

export async function setPassStatus(passId: string, user: User, status: PassStatus): Promise<Pass> {
  await requireOwnerOrAdminPass(passId, user);
  if (!ORGANIZER_SETTABLE_STATUSES.includes(status)) {
    throw new PassValidationError("status_not_assignable", "Этот статус выставляется автоматически, вручную выбрать его нельзя.");
  }
  return prisma.pass.update({ where: { id: passId }, data: { status } });
}

// "Удаление" Pass из UI — архивация, а не физическое удаление строки:
// история проданных Ticket не должна потерять смысл (CLAUDE.md §18).
export async function archivePass(passId: string, user: User): Promise<Pass> {
  return setPassStatus(passId, user, "ARCHIVED");
}

// Лениво (тот же принцип, что syncNoShowForEvent) синхронизирует SOLD_OUT/
// ENDED с реальным состоянием — вызывается перед каждым чтением списка Pass.
// Никогда не трогает DRAFT/PAUSED/ARCHIVED (это решения человека) — только
// переключает между ACTIVE и SOLD_OUT/ENDED, и обратно из SOLD_OUT в ACTIVE,
// когда место освободилось (отмена/возврат билета, см. ticket-service.ts) и
// срок действия ещё не истёк.
export async function syncPassLifecycle(pass: Pass): Promise<Pass> {
  const now = new Date();
  const isSoldOut = pass.quantity != null && pass.soldQuantity >= pass.quantity;
  const isEnded = pass.validUntil != null && pass.validUntil < now;

  let nextStatus: PassStatus | null = null;
  if (pass.status === "ACTIVE" && isEnded) nextStatus = "ENDED";
  else if (pass.status === "ACTIVE" && isSoldOut) nextStatus = "SOLD_OUT";
  else if (pass.status === "SOLD_OUT" && isEnded) nextStatus = "ENDED";
  else if (pass.status === "SOLD_OUT" && !isSoldOut) nextStatus = "ACTIVE";

  if (nextStatus === null || nextStatus === pass.status) return pass;
  return prisma.pass.update({ where: { id: pass.id }, data: { status: nextStatus } });
}

export type PassWithAvailability = Pass & { availableQuantity: number | null };

function withAvailability(pass: Pass): PassWithAvailability {
  return { ...pass, availableQuantity: pass.quantity == null ? null : Math.max(pass.quantity - pass.soldQuantity, 0) };
}

export async function listPassesForEvent(eventId: string, user: User): Promise<PassWithAvailability[]> {
  await requireOwnerOrAdminEvent(eventId, user);
  const passes = await prisma.pass.findMany({ where: { eventId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  const synced = await Promise.all(passes.map((p) => syncPassLifecycle(p)));
  return synced.map(withAvailability);
}

export async function getPass(passId: string, user: User): Promise<PassWithAvailability> {
  const pass = await requireOwnerOrAdminPass(passId, user);
  const synced = await syncPassLifecycle(pass);
  return withAvailability(synced);
}
