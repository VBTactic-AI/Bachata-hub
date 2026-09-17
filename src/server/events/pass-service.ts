import type { Pass, PassAccessGrant, PassPriceTier, PassRefundPolicy, PassStatus, PassType, PromoCode, PromoDiscountType, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasEventAccess, isOwnerOrAdmin } from "./access";
import { EventsValidationError, RegistrationForbiddenError, RegistrationNotFoundError } from "./registration-service";

// Ticket Engine — Pass CRUD (2026-09-16). Управлять предложениями доступа
// (создавать/редактировать/менять статус/ценовые периоды/доступ/промокоды)
// может только владелец события или ADMIN — тот же принцип, что и в
// team-service.ts (цены/инвентарь — не менее чувствительная зона, чем состав
// команды события). Читать список Pass может любой член команды (hasEventAccess)
// — им это нужно, чтобы выдавать билеты (см. ticket-service.ts).

export class PassValidationError extends EventsValidationError {}

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

async function requireEventAccessForEvent(eventId: string, user: User) {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw new RegistrationNotFoundError();
  if (!(await hasEventAccess(event, user))) throw new RegistrationForbiddenError("forbidden");
  return event;
}

// Экспортирован — переиспользуется pass-template-service.ts ("Сохранить как
// шаблон" делает тот же owner-check, что и редактирование Pass).
export async function requireOwnerOrAdminPass(passId: string, user: User) {
  const pass = await prisma.pass.findUnique({ where: { id: passId }, include: { event: true } });
  if (!pass) throw new RegistrationNotFoundError();
  if (!isOwnerOrAdmin(pass.event, user)) throw new RegistrationForbiddenError("forbidden");
  return pass;
}

async function requireEventAccessForPass(passId: string, user: User) {
  const pass = await prisma.pass.findUnique({ where: { id: passId }, include: { event: true } });
  if (!pass) throw new RegistrationNotFoundError();
  if (!(await hasEventAccess(pass.event, user))) throw new RegistrationForbiddenError("forbidden");
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
  imageUrl?: string | null;
  allowMultipleEntry?: boolean;
  // Условия возврата (2026-09-17, Stage 7 плана Festival Engine,
  // docs/FESTIVAL_SERVICE_LAYER_PLAN.md) — поля уже были в схеме
  // (PassRefundPolicy), здесь впервые подключены к CRUD. Это ТОЛЬКО
  // информационная политика для покупателя — никакой автоматической
  // обработки возврата по ней не реализуется, refundTicket() как был
  // ручным (организатор решает сам), так и остаётся.
  refundPolicy?: PassRefundPolicy;
  refundDeadline?: Date | null;
  refundFeePercent?: number | null;
};

// Экспортирована (2026-09-17) — переиспользуется festival-service.ts
// (createFestivalPass) для валидации Pass, создаваемого в контексте
// фестиваля, без дублирования правил.
export function validateCommon(input: Partial<PassInput>): void {
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

type EffectiveRefundFields = { refundPolicy: PassRefundPolicy; refundDeadline: Date | null; refundFeePercent: number | null };

// UNTIL_DATE без даты или PARTIAL без размера комиссии — не по чему судить
// покупателю об условиях (тот же принцип, что и у discountType/discountValue
// в festival-referral-code-service.ts). Проверяется на уже СХЛОПНУТЫХ
// (effective) значениях — вызывающий код сам решает, как их получить: у
// createPass/createFestivalPass это просто input с дефолтами, у updatePass —
// патч, слитый с уже сохранённым Pass (см. computeEffectiveRefundFields).
export function validateRefundPolicy(effective: EffectiveRefundFields): void {
  if (effective.refundPolicy === "UNTIL_DATE" && !effective.refundDeadline) {
    throw new PassValidationError("refund_deadline_required", "Для условия «возврат до даты» нужно указать дату.");
  }
  if (effective.refundPolicy === "PARTIAL" && (effective.refundFeePercent == null || effective.refundFeePercent <= 0)) {
    throw new PassValidationError("refund_fee_required", "Для частичного возврата нужно указать размер комиссии в процентах.");
  }
  if (effective.refundFeePercent != null && (effective.refundFeePercent < 0 || effective.refundFeePercent > 100)) {
    throw new PassValidationError("invalid_refund_fee_percent", "Комиссия за возврат должна быть от 0 до 100%.");
  }
}

// Поля refundDeadline/refundFeePercent имеют смысл только при своей
// соответствующей политике — при остальных политиках нормализуются в null,
// чтобы в БД не залёживались значения от политики, которая больше не
// действует (например, дата дедлайна от старого UNTIL_DATE после смены на
// FULL). Экспортирована — переиспользуется createFestivalPass в
// festival-service.ts (тот же "create с дефолтами", не merge с текущей
// строкой, как у updatePass ниже).
export function deriveRefundFields(input: Partial<PassInput>): EffectiveRefundFields {
  const refundPolicy = input.refundPolicy ?? "NONE";
  const effective: EffectiveRefundFields = {
    refundPolicy,
    refundDeadline: refundPolicy === "UNTIL_DATE" ? input.refundDeadline ?? null : null,
    refundFeePercent: refundPolicy === "PARTIAL" ? input.refundFeePercent ?? null : null,
  };
  validateRefundPolicy(effective);
  return effective;
}

export async function createPass(eventId: string, user: User, input: PassInput): Promise<Pass> {
  await requireOwnerOrAdminEvent(eventId, user);
  validateCommon(input);
  const refundFields = deriveRefundFields(input);

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
      imageUrl: input.imageUrl?.trim() || null,
      allowMultipleEntry: input.allowMultipleEntry ?? true,
      ...refundFields,
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

  // Условия возврата — интерфейс "патча", а не независимые поля: чтобы
  // проверить пару UNTIL_DATE+refundDeadline/PARTIAL+refundFeePercent,
  // нужны СХЛОПНУТЫЕ (patch поверх уже сохранённого Pass) значения, не сам
  // patch по отдельности — иначе "поменяли только refundFeePercent, политика
  // уже была PARTIAL" не прошло бы валидацию, хотя это корректное изменение.
  const refundTouched = patch.refundPolicy !== undefined || patch.refundDeadline !== undefined || patch.refundFeePercent !== undefined;
  let refundFields: Partial<EffectiveRefundFields> = {};
  if (refundTouched) {
    const refundPolicy = patch.refundPolicy ?? pass.refundPolicy;
    const refundDeadline =
      refundPolicy === "UNTIL_DATE" ? (patch.refundDeadline !== undefined ? patch.refundDeadline : pass.refundDeadline) : null;
    const refundFeePercent =
      refundPolicy === "PARTIAL"
        ? patch.refundFeePercent !== undefined
          ? patch.refundFeePercent
          : pass.refundFeePercent != null
            ? Number(pass.refundFeePercent)
            : null
        : null;
    validateRefundPolicy({ refundPolicy, refundDeadline, refundFeePercent });
    refundFields = { refundPolicy, refundDeadline, refundFeePercent };
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
      ...(patch.imageUrl !== undefined ? { imageUrl: patch.imageUrl?.trim() || null } : {}),
      ...(patch.allowMultipleEntry !== undefined ? { allowMultipleEntry: patch.allowMultipleEntry } : {}),
      ...refundFields,
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

// "Удаление" Pass из UI по умолчанию — архивация, а не физическое удаление
// строки: история проданных Ticket не должна потерять смысл (CLAUDE.md §18).
export async function archivePass(passId: string, user: User): Promise<Pass> {
  return setPassStatus(passId, user, "ARCHIVED");
}

// Настоящее физическое удаление (2026-09-16, по прямому запросу
// пользователя — "можно удалить pass к конкретному событию") — разрешено
// ТОЛЬКО если по этому Pass ещё никогда никому не выдавался билет. Это не
// нарушает CLAUDE.md §18: удаляется черновик/неиспользованное предложение, а
// не история продаж — если хоть один Ticket уже существует, FK
// "Ticket.passId -> Pass" (без onDelete) в любом случае физически не даст
// удалить строку на уровне БД, здесь только явная, понятная проверка ДО
// похода в БД (человекочитаемая ошибка вместо голого P2003).
//
// ВАЖНО: проверяем именно наличие строк Ticket, а не pass.soldQuantity —
// soldQuantity уменьшается обратно при cancelTicket/refundTicket (см.
// ticket-service.ts), но сам Ticket не удаляется (аудит), поэтому Pass с
// soldQuantity === 0, но с отменённым в прошлом билетом, всё равно не
// проходит FK и должен быть отклонён этой проверкой, а не падать 500
// (найдено вживую при QA-очистке, 2026-09-16).
export async function deletePass(passId: string, user: User): Promise<void> {
  const pass = await requireOwnerOrAdminPass(passId, user);
  const ticketCount = await prisma.ticket.count({ where: { passId } });
  if (ticketCount > 0) {
    throw new PassValidationError(
      "pass_has_sales",
      "Нельзя удалить Pass, по которому уже выдавались билеты — используйте «Закрыть» (архивация)."
    );
  }
  await prisma.pass.delete({ where: { id: passId } });
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
  await requireEventAccessForEvent(eventId, user);
  const passes = await prisma.pass.findMany({ where: { eventId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  const synced = await Promise.all(passes.map((p) => syncPassLifecycle(p)));
  return synced.map(withAvailability);
}

// Публичная — без RBAC (перенос UI, Stage UI-5: первая публичная страница,
// которая вообще показывает Pass гостям — /festivals/[slug]). Только
// ACTIVE/SOLD_OUT — DRAFT/PAUSED/ARCHIVED/ENDED организатор ещё не готов
// либо больше не хочет показывать посетителям.
export async function listPublicPassesForEvent(eventId: string): Promise<PassWithAvailability[]> {
  const passes = await prisma.pass.findMany({
    where: { eventId, status: { in: ["ACTIVE", "SOLD_OUT"] } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  const synced = await Promise.all(passes.map((p) => syncPassLifecycle(p)));
  return synced.map(withAvailability);
}

export async function getPass(passId: string, user: User): Promise<PassWithAvailability> {
  const pass = await requireEventAccessForPass(passId, user);
  const synced = await syncPassLifecycle(pass);
  return withAvailability(synced);
}

// ---------------------------------------------------------------------------
// PassPriceTier — ценовые периоды (Early Bird/Regular/Late), 2026-09-16
// ---------------------------------------------------------------------------

export type PriceTierInput = {
  label: string;
  price: number;
  currency?: string | null;
  validFrom?: Date | null;
  validUntil?: Date | null;
  sortOrder?: number;
};

function validateTierInput(input: Partial<PriceTierInput>): void {
  if (input.label !== undefined && !input.label.trim()) {
    throw new PassValidationError("tier_label_required", "Название ценового периода обязательно.");
  }
  if (input.price != null && input.price < 0) {
    throw new PassValidationError("invalid_tier_price", "Цена периода не может быть отрицательной.");
  }
  if (input.validFrom && input.validUntil && input.validFrom > input.validUntil) {
    throw new PassValidationError("invalid_tier_window", "Начало периода не может быть позже его окончания.");
  }
}

function tiersOverlap(a: { validFrom: Date | null; validUntil: Date | null }, b: { validFrom: Date | null; validUntil: Date | null }): boolean {
  const aStart = a.validFrom ?? new Date(-8640000000000000); // -∞
  const aEnd = a.validUntil ?? new Date(8640000000000000); // +∞
  const bStart = b.validFrom ?? new Date(-8640000000000000);
  const bEnd = b.validUntil ?? new Date(8640000000000000);
  return aStart < bEnd && bStart < aEnd;
}

export async function createPriceTier(passId: string, user: User, input: PriceTierInput): Promise<PassPriceTier> {
  const pass = await requireOwnerOrAdminPass(passId, user);
  validateTierInput(input);

  const existing = await prisma.passPriceTier.findMany({ where: { passId } });
  const window = { validFrom: input.validFrom ?? null, validUntil: input.validUntil ?? null };
  if (existing.some((t) => tiersOverlap(t, window))) {
    throw new PassValidationError("tier_window_overlap", "Окно этого ценового периода пересекается с уже существующим.");
  }

  return prisma.passPriceTier.create({
    data: {
      passId: pass.id,
      label: input.label.trim(),
      price: input.price,
      currency: input.currency?.trim() || null,
      validFrom: input.validFrom ?? null,
      validUntil: input.validUntil ?? null,
      sortOrder: input.sortOrder ?? 0,
    },
  });
}

export async function updatePriceTier(tierId: string, user: User, patch: Partial<PriceTierInput>): Promise<PassPriceTier> {
  const tier = await prisma.passPriceTier.findUnique({ where: { id: tierId }, include: { pass: { include: { event: true } } } });
  if (!tier) throw new RegistrationNotFoundError();
  if (!isOwnerOrAdmin(tier.pass.event, user)) throw new RegistrationForbiddenError("forbidden");
  validateTierInput(patch);

  const merged = {
    validFrom: patch.validFrom !== undefined ? patch.validFrom : tier.validFrom,
    validUntil: patch.validUntil !== undefined ? patch.validUntil : tier.validUntil,
  };
  const others = await prisma.passPriceTier.findMany({ where: { passId: tier.passId, id: { not: tierId } } });
  if (others.some((t) => tiersOverlap(t, merged))) {
    throw new PassValidationError("tier_window_overlap", "Окно этого ценового периода пересекается с уже существующим.");
  }

  return prisma.passPriceTier.update({
    where: { id: tierId },
    data: {
      ...(patch.label !== undefined ? { label: patch.label.trim() } : {}),
      ...(patch.price !== undefined ? { price: patch.price } : {}),
      ...(patch.currency !== undefined ? { currency: patch.currency?.trim() || null } : {}),
      ...(patch.validFrom !== undefined ? { validFrom: patch.validFrom } : {}),
      ...(patch.validUntil !== undefined ? { validUntil: patch.validUntil } : {}),
      ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
    },
  });
}

export async function deletePriceTier(tierId: string, user: User): Promise<void> {
  const tier = await prisma.passPriceTier.findUnique({ where: { id: tierId }, include: { pass: { include: { event: true } } } });
  if (!tier) throw new RegistrationNotFoundError();
  if (!isOwnerOrAdmin(tier.pass.event, user)) throw new RegistrationForbiddenError("forbidden");
  await prisma.passPriceTier.delete({ where: { id: tierId } });
}

export async function listPriceTiers(passId: string, user: User): Promise<PassPriceTier[]> {
  await requireEventAccessForPass(passId, user);
  return prisma.passPriceTier.findMany({ where: { passId }, orderBy: { sortOrder: "asc" } });
}

// Текущая действующая цена — тир, чьё окно содержит "сейчас" (последний
// подходящий по sortOrder, на случай если валидация выше почему-то
// пропустила пересечение), иначе базовая Pass.price/currency. Чистая
// функция — используется и в ticket-service.ts (issueTicket), и тестируется
// отдельно без БД.
export function getCurrentPassPrice(
  pass: { price: unknown; currency: string | null },
  tiers: PassPriceTier[],
  now: Date = new Date()
): { price: number | null; currency: string | null } {
  const active = tiers
    .filter((t) => (t.validFrom == null || t.validFrom <= now) && (t.validUntil == null || t.validUntil >= now))
    .sort((a, b) => b.sortOrder - a.sortOrder);
  if (active.length > 0) {
    return { price: Number(active[0].price), currency: active[0].currency };
  }
  return { price: pass.price == null ? null : Number(pass.price), currency: pass.currency };
}

// ---------------------------------------------------------------------------
// PassAccessGrant — к каким пунктам программы/сессиям даёт доступ Pass
// ---------------------------------------------------------------------------

export type AccessGrantTarget = { programItemId: string } | { masterclassSessionId: string };

// Полная замена списка грантов (проще, чем diff — Pass редактируется не
// каждую секунду, набор грантов обычно маленький). Пустой массив = Pass без
// ограничений (доступ ко всему), см. комментарий у модели.
export async function setAccessGrants(passId: string, user: User, targets: AccessGrantTarget[]): Promise<PassAccessGrant[]> {
  const pass = await requireOwnerOrAdminPass(passId, user);

  return prisma.$transaction(async (tx) => {
    await tx.passAccessGrant.deleteMany({ where: { passId: pass.id } });
    if (targets.length === 0) return [];
    await tx.passAccessGrant.createMany({
      data: targets.map((t) => ({
        passId: pass.id,
        programItemId: "programItemId" in t ? t.programItemId : null,
        masterclassSessionId: "masterclassSessionId" in t ? t.masterclassSessionId : null,
      })),
    });
    return tx.passAccessGrant.findMany({ where: { passId: pass.id } });
  });
}

export async function listAccessGrants(passId: string, user: User): Promise<PassAccessGrant[]> {
  await requireEventAccessForPass(passId, user);
  return prisma.passAccessGrant.findMany({
    where: { passId },
    include: { programItem: { select: { id: true, title: true } }, masterclassSession: { select: { id: true, title: true } } },
  });
}

// ---------------------------------------------------------------------------
// PromoCode — только схема + CRUD (2026-09-16). Расчёт скидки при выдаче
// билета сознательно не реализован — прямые слова пользователя: "не
// обязательно делать прямо сейчас".
// ---------------------------------------------------------------------------

export type PromoCodeInput = {
  code: string;
  discountType: PromoDiscountType;
  discountValue: number;
  validFrom?: Date | null;
  validUntil?: Date | null;
  maxUses?: number | null;
  passIds?: string[]; // пусто/не передано — применим к любому Pass события
};

function validatePromoCodeInput(input: Partial<PromoCodeInput>): void {
  if (input.code !== undefined && !input.code.trim()) {
    throw new PassValidationError("promo_code_required", "Код обязателен.");
  }
  if (input.discountValue != null && input.discountValue <= 0) {
    throw new PassValidationError("invalid_discount_value", "Размер скидки должен быть положительным.");
  }
  if (input.discountType === "PERCENT" && input.discountValue != null && input.discountValue > 100) {
    throw new PassValidationError("invalid_discount_percent", "Скидка в процентах не может быть больше 100.");
  }
  if (input.validFrom && input.validUntil && input.validFrom > input.validUntil) {
    throw new PassValidationError("invalid_promo_window", "Начало действия кода не может быть позже окончания.");
  }
}

export async function createPromoCode(eventId: string, user: User, input: PromoCodeInput): Promise<PromoCode> {
  await requireOwnerOrAdminEvent(eventId, user);
  validatePromoCodeInput(input);

  try {
    return await prisma.promoCode.create({
      data: {
        eventId,
        code: input.code.trim().toUpperCase(),
        discountType: input.discountType,
        discountValue: input.discountValue,
        validFrom: input.validFrom ?? null,
        validUntil: input.validUntil ?? null,
        maxUses: input.maxUses ?? null,
        ...(input.passIds && input.passIds.length > 0 ? { passes: { create: input.passIds.map((passId) => ({ passId })) } } : {}),
      },
    });
  } catch (err) {
    if ((err as { code?: string })?.code === "P2002") {
      throw new PassValidationError("duplicate_promo_code", "Такой код уже используется в этом событии.");
    }
    throw err;
  }
}

export async function listPromoCodesForEvent(eventId: string, user: User): Promise<PromoCode[]> {
  await requireOwnerOrAdminEvent(eventId, user);
  return prisma.promoCode.findMany({ where: { eventId }, orderBy: { createdAt: "desc" }, include: { passes: true } });
}

export async function setPromoCodeActive(promoCodeId: string, user: User, isActive: boolean): Promise<PromoCode> {
  const code = await prisma.promoCode.findUnique({ where: { id: promoCodeId }, include: { event: true } });
  if (!code) throw new RegistrationNotFoundError();
  if (!isOwnerOrAdmin(code.event, user)) throw new RegistrationForbiddenError("forbidden");
  return prisma.promoCode.update({ where: { id: promoCodeId }, data: { isActive } });
}
