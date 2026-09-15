import type { PassStatus, TicketType, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasEventAccess, isOwnerOrAdmin } from "./access";
import { RegistrationForbiddenError, RegistrationNotFoundError } from "./registration-service";

// Ticket Engine v2 (2026-09-16) — TicketType CRUD. Простой билет на ОДНО
// событие ("Dancer — 15 BYN"), НЕ Pass (см. комментарий у моделей в
// schema.prisma). Тот же принцип доступа, что и у pass-service.ts:
// создание/редактирование/статус — владелец события/ADMIN (цены/инвентарь —
// не менее чувствительная зона, чем состав команды), чтение списка — любой
// член команды (нужно, чтобы выдавать билеты).

export class TicketTypeValidationError extends Error {
  constructor(
    public code: string,
    message?: string
  ) {
    super(message ?? code);
  }
}

// Те же 4 значения, что и у Pass — SOLD_OUT/ENDED вычисляются сервером (см.
// syncTicketTypeLifecycle), вручную недоступны.
const ORGANIZER_SETTABLE_STATUSES: PassStatus[] = ["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"];

async function requireOwnerOrAdminEvent(eventId: string, user: User) {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw new RegistrationNotFoundError();
  if (!isOwnerOrAdmin(event, user)) throw new RegistrationForbiddenError("forbidden");
  return event;
}

async function requireOwnerOrAdminTicketType(ticketTypeId: string, user: User) {
  const tt = await prisma.ticketType.findUnique({ where: { id: ticketTypeId }, include: { event: true } });
  if (!tt) throw new RegistrationNotFoundError();
  if (!isOwnerOrAdmin(tt.event, user)) throw new RegistrationForbiddenError("forbidden");
  return tt;
}

async function requireEventAccessForEvent(eventId: string, user: User) {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw new RegistrationNotFoundError();
  if (!(await hasEventAccess(event, user))) throw new RegistrationForbiddenError("forbidden");
  return event;
}

async function requireEventAccessForTicketType(ticketTypeId: string, user: User) {
  const tt = await prisma.ticketType.findUnique({ where: { id: ticketTypeId }, include: { event: true } });
  if (!tt) throw new RegistrationNotFoundError();
  if (!(await hasEventAccess(tt.event, user))) throw new RegistrationForbiddenError("forbidden");
  return tt;
}

export type TicketTypeInput = {
  name: string;
  description?: string | null;
  price?: number | null;
  currency?: string | null;
  quantity?: number | null;
  salesStartAt?: Date | null;
  salesEndAt?: Date | null;
  sortOrder?: number;
};

function validateCommon(input: Partial<TicketTypeInput>): void {
  if (input.name !== undefined && !input.name.trim()) {
    throw new TicketTypeValidationError("name_required", "Название обязательно.");
  }
  if (input.price != null && input.price < 0) {
    throw new TicketTypeValidationError("invalid_price", "Цена не может быть отрицательной.");
  }
  if (input.quantity != null && (!Number.isInteger(input.quantity) || input.quantity <= 0)) {
    throw new TicketTypeValidationError("invalid_quantity", "Количество мест должно быть положительным целым числом.");
  }
  if (input.salesStartAt && input.salesEndAt && input.salesStartAt > input.salesEndAt) {
    throw new TicketTypeValidationError("invalid_sales_window", "Дата начала продаж не может быть позже даты окончания продаж.");
  }
}

export async function createTicketType(eventId: string, user: User, input: TicketTypeInput): Promise<TicketType> {
  await requireOwnerOrAdminEvent(eventId, user);
  validateCommon(input);

  return prisma.ticketType.create({
    data: {
      eventId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      price: input.price ?? null,
      currency: input.currency?.trim() || null,
      quantity: input.quantity ?? null,
      salesStartAt: input.salesStartAt ?? null,
      salesEndAt: input.salesEndAt ?? null,
      sortOrder: input.sortOrder ?? 0,
    },
  });
}

export async function updateTicketType(ticketTypeId: string, user: User, patch: Partial<TicketTypeInput>): Promise<TicketType> {
  const tt = await requireOwnerOrAdminTicketType(ticketTypeId, user);
  validateCommon(patch);

  if (patch.quantity !== undefined && patch.quantity != null && patch.quantity < tt.soldQuantity) {
    throw new TicketTypeValidationError(
      "quantity_below_sold",
      `Нельзя установить лимит меньше уже проданных билетов (продано: ${tt.soldQuantity}).`
    );
  }

  return prisma.ticketType.update({
    where: { id: ticketTypeId },
    data: {
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.description !== undefined ? { description: patch.description?.trim() || null } : {}),
      ...(patch.price !== undefined ? { price: patch.price } : {}),
      ...(patch.currency !== undefined ? { currency: patch.currency?.trim() || null } : {}),
      ...(patch.quantity !== undefined ? { quantity: patch.quantity } : {}),
      ...(patch.salesStartAt !== undefined ? { salesStartAt: patch.salesStartAt } : {}),
      ...(patch.salesEndAt !== undefined ? { salesEndAt: patch.salesEndAt } : {}),
      ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
    },
  });
}

export async function setTicketTypeStatus(ticketTypeId: string, user: User, status: PassStatus): Promise<TicketType> {
  await requireOwnerOrAdminTicketType(ticketTypeId, user);
  if (!ORGANIZER_SETTABLE_STATUSES.includes(status)) {
    throw new TicketTypeValidationError("status_not_assignable", "Этот статус выставляется автоматически, вручную выбрать его нельзя.");
  }
  return prisma.ticketType.update({ where: { id: ticketTypeId }, data: { status } });
}

export async function archiveTicketType(ticketTypeId: string, user: User): Promise<TicketType> {
  return setTicketTypeStatus(ticketTypeId, user, "ARCHIVED");
}

// Настоящее физическое удаление — только если по этому TicketType ещё
// никогда никому не выдавался билет (тот же принцип, что и deletePass в
// pass-service.ts — проверяем реальное наличие строк Ticket, а не
// soldQuantity, см. комментарий там про регрессию с cancelTicket).
export async function deleteTicketType(ticketTypeId: string, user: User): Promise<void> {
  await requireOwnerOrAdminTicketType(ticketTypeId, user);
  const ticketCount = await prisma.ticket.count({ where: { ticketTypeId } });
  if (ticketCount > 0) {
    throw new TicketTypeValidationError(
      "ticket_type_has_sales",
      "Нельзя удалить билет, по которому уже выдавались Ticket — используйте «Закрыть» (архивация)."
    );
  }
  await prisma.ticketType.delete({ where: { id: ticketTypeId } });
}

// Лениво синхронизирует SOLD_OUT/ENDED — тот же принцип, что и
// syncPassLifecycle в pass-service.ts (TicketType не имеет validUntil,
// только продолжительность продаж — "ENDED" здесь означает "продажи
// закончились по времени", не "мероприятие прошло").
export async function syncTicketTypeLifecycle(tt: TicketType): Promise<TicketType> {
  const now = new Date();
  const isSoldOut = tt.quantity != null && tt.soldQuantity >= tt.quantity;
  const isEnded = tt.salesEndAt != null && tt.salesEndAt < now;

  let nextStatus: PassStatus | null = null;
  if (tt.status === "ACTIVE" && isEnded) nextStatus = "ENDED";
  else if (tt.status === "ACTIVE" && isSoldOut) nextStatus = "SOLD_OUT";
  else if (tt.status === "SOLD_OUT" && isEnded) nextStatus = "ENDED";
  else if (tt.status === "SOLD_OUT" && !isSoldOut) nextStatus = "ACTIVE";

  if (nextStatus === null || nextStatus === tt.status) return tt;
  return prisma.ticketType.update({ where: { id: tt.id }, data: { status: nextStatus } });
}

export type TicketTypeWithAvailability = TicketType & { availableQuantity: number | null };

function withAvailability(tt: TicketType): TicketTypeWithAvailability {
  return { ...tt, availableQuantity: tt.quantity == null ? null : Math.max(tt.quantity - tt.soldQuantity, 0) };
}

export async function listTicketTypesForEvent(eventId: string, user: User): Promise<TicketTypeWithAvailability[]> {
  await requireEventAccessForEvent(eventId, user);
  const items = await prisma.ticketType.findMany({ where: { eventId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  const synced = await Promise.all(items.map((t) => syncTicketTypeLifecycle(t)));
  return synced.map(withAvailability);
}

export async function getTicketType(ticketTypeId: string, user: User): Promise<TicketTypeWithAvailability> {
  const tt = await requireEventAccessForTicketType(ticketTypeId, user);
  const synced = await syncTicketTypeLifecycle(tt);
  return withAvailability(synced);
}
