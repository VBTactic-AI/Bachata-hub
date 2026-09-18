import type { Prisma, Ticket, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasEventAccess } from "./access";
import { RegistrationForbiddenError, RegistrationNotFoundError } from "./registration-service";
import { getCurrentPassPrice } from "./pass-service";
import { isReferralCodeCurrentlyActive } from "./festival-referral-code-service";

// Ticket Engine (2026-09-16) — билет доступа (с Pass или без, см. комментарий
// у модели Ticket в schema.prisma). Управление билетами/оплатой — тот же
// уровень доступа, что и у остальной повседневной работы с участниками
// (hasEventAccess — владелец/ADMIN/любой член команды события), в отличие от
// pass-service.ts (создание/цена/лимиты Pass — это уже конфигурация события,
// isOwnerOrAdmin, тот же принцип, что и редактирование самого Event).

export class TicketValidationError extends Error {
  constructor(
    public code: string,
    message?: string
  ) {
    super(message ?? code);
  }
}
export class DuplicateTicketError extends Error {}

async function requireAccessForPass(passId: string, user: User) {
  const pass = await prisma.pass.findUnique({ where: { id: passId }, include: { event: true } });
  if (!pass) throw new RegistrationNotFoundError();
  if (!(await hasEventAccess(pass.event, user))) throw new RegistrationForbiddenError("forbidden");
  return pass;
}

async function requireAccessForTicketType(ticketTypeId: string, user: User) {
  const tt = await prisma.ticketType.findUnique({ where: { id: ticketTypeId }, include: { event: true } });
  if (!tt) throw new RegistrationNotFoundError();
  if (!(await hasEventAccess(tt.event, user))) throw new RegistrationForbiddenError("forbidden");
  return tt;
}

// Экспортирована — переиспользуется ticket-checkin-service.ts (тот же
// owner-check, что и остальная повседневная работа с билетами).
export async function requireAccessForTicket(ticketId: string, user: User) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, include: { event: true } });
  if (!ticket) throw new RegistrationNotFoundError();
  if (!(await hasEventAccess(ticket.event, user))) throw new RegistrationForbiddenError("forbidden");
  return ticket;
}

// ---------------------------------------------------------------------------
// Commerce Engine v1 (2026-09-17) — Phase 3. Формализует РУЧНУЮ выдачу
// (issueTicket/issueTicketForType уже требуют организатора/член команды,
// деньги получены вне системы) в Order/OrderItem/Payment(provider=MANUAL),
// не меняя сигнатуры/поведение существующих функций и не трогая старые поля
// Ticket (price/isPaid/paidAt и т.д. остаются как есть, для обратной
// совместимости читающего кода — см. docs/00_DECISIONS.md, Commerce Engine
// v1). Self-checkout/реальный эквайринг — вне рамок этой правки.
// ---------------------------------------------------------------------------

async function findOrCreateUserPassInTx(tx: Prisma.TransactionClient, dancerId: string, passId: string) {
  return tx.userPass.upsert({
    where: { dancerId_passId: { dancerId, passId } },
    update: {},
    create: { dancerId, passId, status: "ACTIVE" },
  });
}

type ManualOrderArgs = {
  eventId: string;
  dancerId: string;
  productId: string;
  nameSnapshot: string;
  price: number | null;
  currency: string | null;
  discountAmount: number | null;
  promoCodeId: string | null;
  referralCodeId: string | null;
  isPaid: boolean;
  paidAt: Date | null;
  issuedById: string;
  issuedAt: Date;
  // Способ расчёта (2026-09-18) — наличные/безнал, только имеет смысл когда
  // isPaid=true; null, если оплата ещё не отмечена (нечего фиксировать) или
  // организатор не указал способ.
  paymentMethod: "CASH" | "TRANSFER" | null;
};

// Создаёт Order(1 позиция)+OrderItem+Payment(MANUAL) одной группой внутри уже
// открытой транзакции — снимок цены/названия на момент выдачи (CLAUDE.md
// §50-51: исторические данные не пересчитываются при изменении Pass/
// TicketType). quantity всегда 1 — issueTicket/issueTicketForType выдают
// ровно один билет за вызов, как и раньше.
async function recordManualOrderInTx(tx: Prisma.TransactionClient, args: ManualOrderArgs): Promise<{ orderId: string; orderItemId: string }> {
  const subtotal = args.price ?? 0;
  const discount = args.discountAmount ?? 0;
  const total = Math.max(subtotal - discount, 0);

  const order = await tx.order.create({
    data: {
      eventId: args.eventId,
      dancerId: args.dancerId,
      status: args.isPaid ? "PAID" : "PENDING",
      currency: args.currency,
      subtotal,
      discount,
      total,
      promoCodeId: args.promoCodeId,
      referralCodeId: args.referralCodeId,
      createdById: args.issuedById,
      createdAt: args.issuedAt,
    },
  });
  const item = await tx.orderItem.create({
    data: {
      orderId: order.id,
      productId: args.productId,
      nameSnapshot: args.nameSnapshot,
      unitPriceSnapshot: args.price,
      currencySnapshot: args.currency,
      quantity: 1,
      discountAmount: args.discountAmount,
      total,
      createdAt: args.issuedAt,
    },
  });
  await tx.payment.create({
    data: {
      orderId: order.id,
      provider: "MANUAL",
      amount: total,
      currency: args.currency,
      status: args.isPaid ? "PAID" : "PENDING",
      method: args.isPaid ? args.paymentMethod : null,
      paidAt: args.paidAt,
      recordedById: args.issuedById,
      createdAt: args.issuedAt,
    },
  });
  return { orderId: order.id, orderItemId: item.id };
}

// Находит Order, к которому фактически привязана оплата ЭТОГО Ticket — через
// прямой OrderItem (TicketType-билет) либо через UserPass.orderItemId
// (Pass-билет — ТОЛЬКО если это оригинальная покупка, а не "производный"
// вход на дочернее событие фестиваля без собственной оплаты, см. комментарий
// у issueFestivalPassEntry). Возвращает null, если для этого конкретного
// Ticket нет отдельного Order — тогда cancelTicket/refundTicket не трогают
// Commerce-таблицы, ровно как и раньше не трогали ничего, кроме самого Ticket.
async function findOrderIdForTicketInTx(
  tx: Prisma.TransactionClient,
  ticket: { orderItemId: string | null; userPassId: string | null }
): Promise<string | null> {
  if (ticket.orderItemId) {
    const item = await tx.orderItem.findUnique({ where: { id: ticket.orderItemId }, select: { orderId: true } });
    return item?.orderId ?? null;
  }
  if (ticket.userPassId) {
    const userPass = await tx.userPass.findUnique({ where: { id: ticket.userPassId }, select: { orderItemId: true } });
    if (!userPass?.orderItemId) return null;
    const item = await tx.orderItem.findUnique({ where: { id: userPass.orderItemId }, select: { orderId: true } });
    return item?.orderId ?? null;
  }
  return null;
}

function assertOnSale(pass: { status: string; salesStartAt: Date | null; salesEndAt: Date | null }): void {
  const now = new Date();
  // SOLD_OUT — отдельная, более конкретная причина отказа, чем общее
  // "не в продаже": к моменту следующей попытки выдачи статус уже
  // автоматически переключён (см. issueTicket ниже), поэтому без этой ветки
  // покупатель видел бы обманчивое "не в продаже" вместо "мест больше нет".
  if (pass.status === "SOLD_OUT") {
    throw new TicketValidationError("sold_out", "Свободных мест по этому Pass больше нет.");
  }
  if (pass.status !== "ACTIVE") {
    throw new TicketValidationError("pass_not_on_sale", "Этот Pass сейчас не в продаже.");
  }
  if (pass.salesStartAt && pass.salesStartAt > now) {
    throw new TicketValidationError("sales_not_started", "Продажи ещё не начались.");
  }
  if (pass.salesEndAt && pass.salesEndAt < now) {
    throw new TicketValidationError("sales_ended", "Продажи уже закончились.");
  }
}

// Commerce Engine v1 (2026-09-18) — максимум ОДИН билет допуска на танцора
// на ОДНО событие, независимо от того, из какого каталога он взят (Pass или
// TicketType) — прямое решение пользователя после разбора живого кейса
// (танцор одновременно держал "Танцор" Pass и "Преподаватель" TicketType на
// одну и ту же вечеринку, что бессмысленно: один человек — один способ
// войти). НЕ путать с межсобытийным Pass фестиваля (issueFestivalPassEntry)
// — там речь о ДРУГОМ (дочернем) событии, это правило его не касается.
// Исключение — сам покупаемый продукт (иначе повторная покупка того же Pass
// падала бы на эту проверку раньше, чем на понятный DuplicateTicketError от
// уникального констрейнта). Advisory lock на пару (event, dancer) — тот же
// приём, что и в markRegistrationPayment, закрывает гонку "два разных
// продукта выданы одновременно, до commit друг друга".
async function assertSingleAdmissionPerEvent(
  tx: Prisma.TransactionClient,
  eventId: string,
  dancerId: string,
  excluding: { passId: string | null; ticketTypeId: string | null }
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${eventId}), hashtext(${dancerId}))`;
  const existing = await tx.ticket.findFirst({
    where: {
      eventId,
      dancerId,
      status: "ISSUED",
      NOT: { passId: excluding.passId, ticketTypeId: excluding.ticketTypeId },
    },
    select: { id: true },
  });
  if (existing) {
    throw new TicketValidationError(
      "already_has_admission",
      "У этого танцора уже есть действующий билет на это событие — выдать второй одновременно нельзя. Сначала отмените или верните существующий."
    );
  }
}

// Commerce Engine v1 (2026-09-18) — применение скидки PromoCode. Раньше
// PromoCode существовал только как схема + CRUD (pass-service.ts) — ни один
// код скидку не считал (прямое решение пользователя в более ранней сессии:
// "не обязательно делать прямо сейчас"). Реализовано только для Pass —
// PromoCodePass, единственная связь, которая вообще существует в схеме;
// TicketType намеренно проще и промокодов не поддерживает (docs/
// 00_DECISIONS.md, D10 — TicketType и Pass разные сущности, не сужаем одно
// под другое задним числом).
function isPromoCodeCurrentlyValid(
  code: { isActive: boolean; validFrom: Date | null; validUntil: Date | null; maxUses: number | null; usedCount: number },
  now: Date = new Date()
): boolean {
  if (!code.isActive) return false;
  if (code.validFrom && code.validFrom > now) return false;
  if (code.validUntil && code.validUntil < now) return false;
  if (code.maxUses != null && code.usedCount >= code.maxUses) return false;
  return true;
}

// Пустой список passes у PromoCode = применим к любому Pass события (тот же
// принцип "пусто — без ограничений", что и у PassAccessGrant).
function isPromoCodeApplicableToPass(code: { passes: { passId: string }[] }, passId: string): boolean {
  if (code.passes.length === 0) return true;
  return code.passes.some((p) => p.passId === passId);
}

// Скидка не уводит цену в минус и не превышает саму цену. Бесплатный Pass
// (price=null/0) — скидывать нечего, 0. Экспортирована — переиспользуется
// в тестах отдельно от issueTicket (чистая функция, без БД).
export function computePromoDiscount(price: number | null, discountType: "PERCENT" | "FIXED_AMOUNT", discountValue: number): number {
  if (price == null || price <= 0) return 0;
  const raw = discountType === "PERCENT" ? price * (Number(discountValue) / 100) : Number(discountValue);
  return Math.min(Math.max(raw, 0), price);
}

// Выдача билета на конкретный Pass — сегодня единственный способ (organizer/
// ADMIN/член команды вручную, см. комментарий у Ticket в schema.prisma про
// будущий онлайн-эквайринг/дистрибьюторов). markPaid — организатор уже
// получил деньги в момент выдачи. Бесплатный Pass (price = null/0) ВСЕГДА
// выдаётся оплаченным, независимо от markPaid (ТЗ: "бесплатный билет не
// создаёт ошибочный payment").
// Танцор должен сначала обычным образом зарегистрироваться на событие
// (EventRegistration) — и только потом ему можно продать/выдать Pass (прямое
// решение пользователя, 2026-09-16): так "Участники" остаются полной
// картиной — любой держатель Pass всегда виден в общем списке участников,
// без отдельных "невидимых" покупателей.
const REGISTERED_STATUSES_FOR_PASS_PURCHASE = ["REGISTERED", "CONFIRMED", "WAITLIST"] as const;

export async function issueTicket(
  passId: string,
  dancerId: string,
  user: User,
  options: { markPaid?: boolean; referralCode?: string; promoCode?: string; paymentMethod?: "CASH" | "TRANSFER" } = {}
): Promise<Ticket> {
  const pass = await requireAccessForPass(passId, user);
  const dancer = await prisma.dancer.findUnique({ where: { id: dancerId } });
  if (!dancer) throw new RegistrationNotFoundError();

  const registration = await prisma.eventRegistration.findUnique({
    where: { eventId_dancerId: { eventId: pass.eventId, dancerId } },
  });
  if (!registration || !REGISTERED_STATUSES_FOR_PASS_PURCHASE.includes(registration.status as (typeof REGISTERED_STATUSES_FOR_PASS_PURCHASE)[number])) {
    throw new TicketValidationError(
      "not_registered",
      "Танцор должен сначала зарегистрироваться на событие — только потом можно выдать ему Pass."
    );
  }

  return prisma.$transaction(async (tx) => {
    // Advisory lock на Pass — та же защита от гонки, что и в
    // registerForEvent (два одновременных запроса на последнее место не
    // должны оба увидеть "есть место" до commit друг друга).
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${passId}))`;
    await assertSingleAdmissionPerEvent(tx, pass.eventId, dancerId, { passId, ticketTypeId: null });

    const current = await tx.pass.findUniqueOrThrow({ where: { id: passId } });
    assertOnSale(current);
    if (current.quantity != null && current.soldQuantity >= current.quantity) {
      throw new TicketValidationError("sold_out", "Свободных мест по этому Pass больше нет.");
    }
    // Цена читается ВНУТРИ транзакции (current + актуальные ценовые тиры, не
    // более раннее чтение выше) — иначе организатор мог бы поменять цену
    // между проверкой доступа и созданием Ticket, и снимок цены/бесплатный
    // статус определились бы по устаревшим данным.
    const tiers = await tx.passPriceTier.findMany({ where: { passId } });
    const effective = getCurrentPassPrice(current, tiers);

    // PromoCode (2026-09-18) — см. комментарий у computePromoDiscount выше.
    // Цена/скидка читаются ВНУТРИ транзакции, тем же принципом, что и Pass —
    // organizer не может провести оплату по цене, посчитанной ДО начала
    // транзакции.
    let promoCode: Prisma.PromoCodeGetPayload<{ include: { passes: true } }> | null = null;
    let discountAmount = 0;
    if (options.promoCode) {
      const candidate = await tx.promoCode.findUnique({
        where: { eventId_code: { eventId: current.eventId, code: options.promoCode.trim().toUpperCase() } },
        include: { passes: true },
      });
      if (!candidate || !isPromoCodeCurrentlyValid(candidate) || !isPromoCodeApplicableToPass(candidate, passId)) {
        throw new TicketValidationError(
          "invalid_promo_code",
          "Промокод недействителен, неактивен, истёк, исчерпан лимит использований или не подходит для этого Pass."
        );
      }
      promoCode = candidate;
      discountAmount = computePromoDiscount(effective.price, candidate.discountType, Number(candidate.discountValue));
    }
    const finalPrice = effective.price == null ? null : Math.max(effective.price - discountAmount, 0);
    const isFree = finalPrice == null || finalPrice === 0;

    // Реферальный код артиста/школы (2026-09-17, Stage 4 плана Festival
    // Engine, docs/FESTIVAL_SERVICE_LAYER_PLAN.md) — привязка+снимок ТОЛЬКО,
    // без расчёта скидки на чекауте (прямое решение пользователя — того же
    // не реализовано даже у PromoCode). referralDiscountAmount/
    // referralCommissionAmount — снимок ОБЪЯВЛЕННЫХ значений кода на момент
    // выдачи (discountValue/commissionValue как есть), не результат
    // применения процента к цене Pass — организатор сам решает, как эти
    // цифры учитывать при расчёте с артистом/школой вне системы (в проекте
    // нет онлайн-эквайринга, см. комментарий у Ticket).
    let referralCode: Awaited<ReturnType<typeof tx.festivalReferralCode.findUnique>> = null;
    if (options.referralCode) {
      const festival = await tx.festival.findUnique({ where: { eventId: current.eventId } });
      const candidate = festival
        ? await tx.festivalReferralCode.findUnique({
            where: { festivalId_code: { festivalId: festival.id, code: options.referralCode.trim().toUpperCase() } },
          })
        : null;
      if (!candidate || !isReferralCodeCurrentlyActive(candidate)) {
        throw new TicketValidationError("invalid_referral_code", "Реферальный код недействителен, неактивен или истёк.");
      }
      referralCode = candidate;
    }

    // Commerce Engine v1 — Order/OrderItem/Payment(MANUAL) + UserPass рядом с
    // самим Ticket, той же транзакцией (см. комментарий у recordManualOrderInTx
    // выше). Product Pass'а обязан существовать (createPass() создаёт его сама,
    // старые Pass перенесены backfill'ом Phase 2) — отсутствие означает
    // рассинхронизацию данных, а не штатный случай, поэтому явная ошибка, а не
    // молчаливый пропуск бухгалтерии.
    const product = await tx.product.findUnique({ where: { passId } });
    if (!product) throw new Error(`Product не найден для Pass ${passId} — рассинхронизация Commerce Engine.`);
    const userPass = await findOrCreateUserPassInTx(tx, dancerId, passId);
    const isPaidNow = isFree || Boolean(options.markPaid);
    const paidAtNow = isFree || options.markPaid ? new Date() : null;
    const { orderItemId } = await recordManualOrderInTx(tx, {
      eventId: current.eventId,
      dancerId,
      productId: product.id,
      nameSnapshot: current.name,
      price: effective.price,
      currency: effective.currency,
      discountAmount: discountAmount > 0 ? discountAmount : null,
      promoCodeId: promoCode?.id ?? null,
      referralCodeId: referralCode?.id ?? null,
      isPaid: isPaidNow,
      paidAt: paidAtNow,
      issuedById: user.id,
      issuedAt: new Date(),
      paymentMethod: options.paymentMethod ?? null,
    });
    if (!userPass.orderItemId) {
      await tx.userPass.update({ where: { id: userPass.id }, data: { orderItemId } });
    }

    let ticket: Ticket;
    try {
      ticket = await tx.ticket.create({
        data: {
          eventId: current.eventId,
          passId,
          dancerId,
          price: finalPrice,
          currency: effective.currency,
          isPaid: isPaidNow,
          paidAt: paidAtNow,
          issuedById: user.id,
          promoCodeId: promoCode?.id ?? null,
          discountAmount: discountAmount > 0 ? discountAmount : null,
          referralCodeId: referralCode?.id ?? null,
          referralDiscountAmount: referralCode?.discountValue ?? null,
          referralCommissionAmount: referralCode?.commissionValue ?? null,
          userPassId: userPass.id,
        },
      });
    } catch (err) {
      if ((err as Prisma.PrismaClientKnownRequestError)?.code === "P2002") {
        throw new DuplicateTicketError();
      }
      throw err;
    }

    // Лимит использований (maxUses) считается только по успешно созданным
    // билетам — попытка, упавшая на P2002 выше, до этой строки не доходит.
    if (promoCode) {
      await tx.promoCode.update({ where: { id: promoCode.id }, data: { usedCount: { increment: 1 } } });
    }

    const updated = await tx.pass.update({ where: { id: passId }, data: { soldQuantity: { increment: 1 } } });
    if (updated.status === "ACTIVE" && updated.quantity != null && updated.soldQuantity >= updated.quantity) {
      await tx.pass.update({ where: { id: passId }, data: { status: "SOLD_OUT" } });
    }

    return ticket;
  });
}

// Выдача билета на TicketType (2026-09-16, Ticket Engine v2) — та же бизнес-
// логика, что и issueTicket() выше (сначала регистрация, потом покупка;
// advisory-lock на инвентарь; SOLD_OUT), но без ценовых тиров — у TicketType
// одна фиксированная цена (Early Bird — отдельный TicketType, не тир).
export async function issueTicketForType(
  ticketTypeId: string,
  dancerId: string,
  user: User,
  options: { markPaid?: boolean; paymentMethod?: "CASH" | "TRANSFER" } = {}
): Promise<Ticket> {
  const ticketType = await requireAccessForTicketType(ticketTypeId, user);
  const dancer = await prisma.dancer.findUnique({ where: { id: dancerId } });
  if (!dancer) throw new RegistrationNotFoundError();

  const registration = await prisma.eventRegistration.findUnique({
    where: { eventId_dancerId: { eventId: ticketType.eventId, dancerId } },
  });
  if (!registration || !REGISTERED_STATUSES_FOR_PASS_PURCHASE.includes(registration.status as (typeof REGISTERED_STATUSES_FOR_PASS_PURCHASE)[number])) {
    throw new TicketValidationError(
      "not_registered",
      "Танцор должен сначала зарегистрироваться на событие — только потом можно выдать ему билет."
    );
  }

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ticketTypeId}))`;
    await assertSingleAdmissionPerEvent(tx, ticketType.eventId, dancerId, { passId: null, ticketTypeId });

    const current = await tx.ticketType.findUniqueOrThrow({ where: { id: ticketTypeId } });
    assertOnSale(current);
    if (current.quantity != null && current.soldQuantity >= current.quantity) {
      throw new TicketValidationError("sold_out", "Свободных мест по этому билету больше нет.");
    }
    const price = current.price == null ? null : Number(current.price);
    const isFree = price == null || price === 0;

    // Commerce Engine v1 — см. комментарий в issueTicket() выше. TicketType не
    // имеет понятия UserPass (это не Pass) — Order/OrderItem привязываются к
    // Ticket напрямую через orderItemId.
    const product = await tx.product.findUnique({ where: { ticketTypeId } });
    if (!product) throw new Error(`Product не найден для TicketType ${ticketTypeId} — рассинхронизация Commerce Engine.`);
    const isPaidNow = isFree || Boolean(options.markPaid);
    const paidAtNow = isFree || options.markPaid ? new Date() : null;
    const { orderItemId } = await recordManualOrderInTx(tx, {
      eventId: current.eventId,
      dancerId,
      productId: product.id,
      nameSnapshot: current.name,
      price,
      currency: current.currency,
      discountAmount: null,
      promoCodeId: null,
      referralCodeId: null,
      isPaid: isPaidNow,
      paidAt: paidAtNow,
      issuedById: user.id,
      issuedAt: new Date(),
      paymentMethod: options.paymentMethod ?? null,
    });

    let ticket: Ticket;
    try {
      ticket = await tx.ticket.create({
        data: {
          eventId: current.eventId,
          ticketTypeId,
          dancerId,
          price,
          currency: current.currency,
          isPaid: isPaidNow,
          paidAt: paidAtNow,
          issuedById: user.id,
          orderItemId,
        },
      });
    } catch (err) {
      if ((err as Prisma.PrismaClientKnownRequestError)?.code === "P2002") {
        throw new DuplicateTicketError();
      }
      throw err;
    }

    const updated = await tx.ticketType.update({ where: { id: ticketTypeId }, data: { soldQuantity: { increment: 1 } } });
    if (updated.status === "ACTIVE" && updated.quantity != null && updated.soldQuantity >= updated.quantity) {
      await tx.ticketType.update({ where: { id: ticketTypeId }, data: { status: "SOLD_OUT" } });
    }

    return ticket;
  });
}

export async function updateTicketPayment(ticketId: string, user: User, isPaid: boolean): Promise<Ticket> {
  await requireAccessForTicket(ticketId, user);
  return prisma.ticket.update({ where: { id: ticketId }, data: { isPaid, paidAt: isPaid ? new Date() : null } });
}

async function releasePassSlot(tx: Prisma.TransactionClient, passId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${passId}))`;
  const pass = await tx.pass.update({ where: { id: passId }, data: { soldQuantity: { decrement: 1 } } });
  if (pass.status === "SOLD_OUT" && (pass.quantity == null || pass.soldQuantity < pass.quantity)) {
    await tx.pass.update({ where: { id: passId }, data: { status: "ACTIVE" } });
  }
}

async function releaseTicketTypeSlot(tx: Prisma.TransactionClient, ticketTypeId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ticketTypeId}))`;
  const tt = await tx.ticketType.update({ where: { id: ticketTypeId }, data: { soldQuantity: { decrement: 1 } } });
  if (tt.status === "SOLD_OUT" && (tt.quantity == null || tt.soldQuantity < tt.quantity)) {
    await tx.ticketType.update({ where: { id: ticketTypeId }, data: { status: "ACTIVE" } });
  }
}

async function releaseSlot(tx: Prisma.TransactionClient, ticket: { passId: string | null; ticketTypeId: string | null }): Promise<void> {
  if (ticket.passId) await releasePassSlot(tx, ticket.passId);
  else if (ticket.ticketTypeId) await releaseTicketTypeSlot(tx, ticket.ticketTypeId);
}

// Commerce Engine v1 — CANCELLED (перед оплатой, деньги не двигались):
// снимает статус с Order, если для этого конкретного Ticket он вообще есть
// (см. findOrderIdForTicketInTx — "производные" входы на дочерние события
// фестиваля своего Order не имеют, отменять нечего). Отзывает UserPass —
// покупка, которая стояла за этим доступом, больше не действует.
async function cancelCommerceOrderInTx(tx: Prisma.TransactionClient, ticket: { orderItemId: string | null; userPassId: string | null }): Promise<void> {
  const orderId = await findOrderIdForTicketInTx(tx, ticket);
  if (!orderId) return;
  await tx.order.update({ where: { id: orderId }, data: { status: "CANCELLED" } });
  if (ticket.userPassId) {
    await tx.userPass.update({ where: { id: ticket.userPassId }, data: { status: "REVOKED" } });
  }
}

// Commerce Engine v1 — REFUNDED (деньги уже получены, теперь возвращаются):
// создаёт Refund на реально существующий Payment этого Order (CLAUDE.md §29 —
// возврат обязан быть явной, аудируемой операцией, не просто сменой статуса)
// и переводит UserPass в REVOKED (задача, §21 — "после полного возврата
// UserPass → REVOKED"). Причина возврата сегодня фиксированная строка —
// параметризованный reason(actor) для refundTicket() уже задел на будущее,
// не обязателен для текущего объёма задачи.
async function refundCommerceOrderInTx(
  tx: Prisma.TransactionClient,
  ticket: { orderItemId: string | null; userPassId: string | null },
  recordedById: string
): Promise<void> {
  const orderId = await findOrderIdForTicketInTx(tx, ticket);
  if (!orderId) return;
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { payments: true } });
  const payment = order.payments.find((p) => p.status === "PAID") ?? order.payments[0];
  if (payment) {
    await tx.refund.create({
      data: {
        paymentId: payment.id,
        orderId: order.id,
        amount: payment.amount,
        currency: payment.currency,
        reason: "Возврат билета (refundTicket)",
        status: "COMPLETED",
        recordedById,
        completedAt: new Date(),
      },
    });
  }
  await tx.order.update({ where: { id: orderId }, data: { status: "REFUNDED" } });
  if (ticket.userPassId) {
    await tx.userPass.update({ where: { id: ticket.userPassId }, data: { status: "REVOKED" } });
  }
}

export async function cancelTicket(ticketId: string, user: User): Promise<Ticket> {
  const ticket = await requireAccessForTicket(ticketId, user);
  if (ticket.status !== "ISSUED") return ticket; // идемпотентно

  return prisma.$transaction(async (tx) => {
    const updated = await tx.ticket.update({ where: { id: ticketId }, data: { status: "CANCELLED", cancelledAt: new Date() } });
    await releaseSlot(tx, ticket);
    await cancelCommerceOrderInTx(tx, ticket);
    return updated;
  });
}

export async function refundTicket(ticketId: string, user: User): Promise<Ticket> {
  const ticket = await requireAccessForTicket(ticketId, user);
  if (ticket.status === "REFUNDED") return ticket; // идемпотентно
  if (ticket.status === "CANCELLED") {
    throw new TicketValidationError("cannot_refund_cancelled", "Билет уже отменён без оплаты, возврат не требуется.");
  }
  if (!ticket.isPaid) {
    throw new TicketValidationError("not_paid", "Билет не был оплачен — нечего возвращать.");
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.ticket.update({ where: { id: ticketId }, data: { status: "REFUNDED", cancelledAt: new Date() } });
    await releaseSlot(tx, ticket);
    await refundCommerceOrderInTx(tx, ticket, user.id);
    return updated;
  });
}

export async function listTicketsForPass(passId: string, user: User) {
  await requireAccessForPass(passId, user);
  return prisma.ticket.findMany({
    where: { passId },
    include: { dancer: { select: { id: true, displayName: true, avatarUrl: true } } },
    orderBy: { createdAt: "desc" },
  });
}

// Зеркалит listTicketsForPass() выше, для TicketType вместо Pass.
export async function listTicketsForTicketType(ticketTypeId: string, user: User) {
  await requireAccessForTicketType(ticketTypeId, user);
  return prisma.ticket.findMany({
    where: { ticketTypeId },
    include: { dancer: { select: { id: true, displayName: true, avatarUrl: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function listTicketsForEvent(eventId: string, user: User) {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw new RegistrationNotFoundError();
  if (!(await hasEventAccess(event, user))) throw new RegistrationForbiddenError("forbidden");
  return prisma.ticket.findMany({
    where: { eventId },
    include: {
      dancer: { select: { id: true, displayName: true, avatarUrl: true } },
      pass: { select: { id: true, name: true, type: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

// ---------------------------------------------------------------------------
// Универсальная оплата (2026-09-16) — колонка "Билеты" на вкладке
// "Участники" и попап с переключателями. Работает одинаково для событий С
// Pass и БЕЗ него: там, где Pass нет, единственный Ticket — passless
// (passId=null), заводится лениво прямо здесь при первой отметке оплаты.
// ---------------------------------------------------------------------------

export type DancerTicketInfo = {
  id: string;
  passId: string | null;
  passName: string | null;
  ticketTypeId: string | null;
  ticketTypeName: string | null;
  isPaid: boolean;
  // TicketCheckIn (Commerce Engine v1, 2026-09-17) — явка по этому конкретному
  // билету (см. ticket-checkin-service.ts). Отдельно от isPaid — оплаченный
  // билет ещё не обязательно предъявлен на входе.
  checkedIn: boolean;
  // Commerce Engine v1 (2026-09-18) — снимок фактически уплаченной суммы
  // (price) и суммы скидки по промокоду (discountAmount), если она была.
  // price уже ПОСЛЕ вычета скидки (см. issueTicket в ticket-service.ts) —
  // "было" для зачёркнутой цены в UI = price + discountAmount.
  price: number | null;
  currency: string | null;
  discountAmount: number | null;
};

// Только ISSUED — отменённые/возвращённые билеты не участвуют в подсчёте
// "оплачено ли событие для этого танцора" (они больше не действительны).
export async function listTicketsByDancerForEvent(eventId: string, dancerIds: string[]): Promise<Map<string, DancerTicketInfo[]>> {
  const map = new Map<string, DancerTicketInfo[]>();
  if (dancerIds.length === 0) return map;

  const tickets = await prisma.ticket.findMany({
    where: { eventId, dancerId: { in: dancerIds }, status: "ISSUED" },
    include: { pass: { select: { name: true } }, ticketType: { select: { name: true } }, checkIn: { select: { id: true } } },
    orderBy: { createdAt: "asc" },
  });
  for (const t of tickets) {
    const list = map.get(t.dancerId) ?? [];
    list.push({
      id: t.id,
      passId: t.passId,
      passName: t.pass?.name ?? null,
      ticketTypeId: t.ticketTypeId,
      ticketTypeName: t.ticketType?.name ?? null,
      isPaid: t.isPaid,
      checkedIn: t.checkIn != null,
      price: t.price == null ? null : Number(t.price),
      currency: t.currency ?? null,
      discountAmount: t.discountAmount == null ? null : Number(t.discountAmount),
    });
    map.set(t.dancerId, list);
  }
  return map;
}

export type PaymentSummary = "PAID" | "PARTIAL" | "UNPAID";

// Нет ни одного билета — "не оплачено" (для события без Pass это ровно тот
// же смысл, что раньше был у EventRegistration.isPaid=false по умолчанию).
export function summarizePayment(tickets: DancerTicketInfo[] | undefined): PaymentSummary {
  if (!tickets || tickets.length === 0) return "UNPAID";
  const paidCount = tickets.filter((t) => t.isPaid).length;
  if (paidCount === tickets.length) return "PAID";
  if (paidCount === 0) return "UNPAID";
  return "PARTIAL";
}

export async function getEventPaymentSummaryCounts(
  eventId: string,
  dancerIds: string[]
): Promise<{ paidCount: number; partialCount: number; unpaidCount: number }> {
  const byDancer = await listTicketsByDancerForEvent(eventId, dancerIds);
  let paidCount = 0;
  let partialCount = 0;
  let unpaidCount = 0;
  for (const id of dancerIds) {
    const summary = summarizePayment(byDancer.get(id));
    if (summary === "PAID") paidCount++;
    else if (summary === "PARTIAL") partialCount++;
    else unpaidCount++;
  }
  return { paidCount, partialCount, unpaidCount };
}

// Простой случай "1 билет на участника" (событие без Pass, или у танцора
// пока только один Ticket) — тот же UX, что и раньше у
// EventRegistrationPaymentToggle: клик по бейджу переключает оплачено/не
// оплачено. Билета может ещё не быть вообще (лениво — заводится только при
// первой отметке "оплачено"); если ставим "не оплачено", а билета всё равно
// нет — no-op, возвращать нечего.
export async function markRegistrationPayment(registrationId: string, user: User, isPaid: boolean): Promise<Ticket | null> {
  const registration = await prisma.eventRegistration.findUnique({ where: { id: registrationId }, include: { event: true } });
  if (!registration) throw new RegistrationNotFoundError();
  if (!(await hasEventAccess(registration.event, user))) throw new RegistrationForbiddenError("forbidden");

  return prisma.$transaction(async (tx) => {
    // Advisory lock на пару (событие, танцор) — тот же приём, что и у
    // registerForEvent/final-scoring.ts, защищает от гонки "два
    // одновременных клика создают два passless Ticket одному танцору".
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${registration.eventId}), hashtext(${registration.dancerId}))`;

    // passId И ticketTypeId оба null — именно "продукт-less" fallback (см.
    // частичный индекс Ticket_dancerId_eventId_no_product_key), не просто
    // "без Pass" (billet может быть без Pass, но с TicketType).
    const existing = await tx.ticket.findFirst({
      where: { eventId: registration.eventId, dancerId: registration.dancerId, passId: null, ticketTypeId: null },
    });
    if (existing) {
      return tx.ticket.update({ where: { id: existing.id }, data: { isPaid, paidAt: isPaid ? new Date() : null } });
    }
    if (!isPaid) return null;
    return tx.ticket.create({
      data: {
        eventId: registration.eventId,
        dancerId: registration.dancerId,
        passId: null,
        ticketTypeId: null,
        status: "ISSUED",
        isPaid: true,
        paidAt: new Date(),
        issuedById: user.id,
      },
    });
  });
}

// Билеты конкретной регистрации — данные для попапа (когда у танцора
// несколько Ticket на событие).
export async function listTicketsForRegistration(registrationId: string, user: User): Promise<DancerTicketInfo[]> {
  const registration = await prisma.eventRegistration.findUnique({ where: { id: registrationId }, include: { event: true } });
  if (!registration) throw new RegistrationNotFoundError();
  if (!(await hasEventAccess(registration.event, user))) throw new RegistrationForbiddenError("forbidden");

  const byDancer = await listTicketsByDancerForEvent(registration.eventId, [registration.dancerId]);
  return byDancer.get(registration.dancerId) ?? [];
}

// Commerce Engine v1 (2026-09-17) — доход считается ЧЕРЕЗ Order/OrderItem/
// Refund (CLAUDE.md §33: "Revenue = Ticket count × текущая цена" — прямо
// запрещённое упрощение; здесь доход — снимок исторических OrderItem.total,
// за вычетом реально оформленных Refund, а не пересчёт по сегодняшней цене
// Pass/TicketType). ПРОИЗВОДНЫЕ Ticket фестиваля (issueFestivalPassEntry) не
// имеют своего OrderItem вообще — не попадают сюда естественным образом, без
// отдельного условия (см. комментарий у issueFestivalPassEntry) — Revenue
// считает только сам факт продажи Pass, не каждое посещение по нему (см.
// Attendance — getEventPassAttendanceCount).
//
// Возвращаемое число — уже ЧИСТЫЙ доход (net: продажи минус возвраты), не
// "gross" — сегодня в проекте нет отдельного отображения gross/refunds по
// отдельности, это тот же смысл, что и раньше было у "выручки" через Ticket.
async function computeNetProductRevenue(eventId: string, productType: "PASS" | "EVENT_TICKET"): Promise<number> {
  const items = await prisma.orderItem.findMany({
    where: {
      product: { eventId, type: productType },
      order: { status: { in: ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"] } },
    },
    select: { total: true, order: { select: { refunds: { where: { status: "COMPLETED" }, select: { amount: true } } } } },
  });
  return items.reduce((sum, item) => {
    const refunded = item.order.refunds.reduce((r, refund) => r + Number(refund.amount), 0);
    return sum + Math.max(Number(item.total) - refunded, 0);
  }, 0);
}

// Выручка по Pass-билетам события (KPI вкладки "Билеты").
export async function getEventPassRevenue(eventId: string, user: User): Promise<number> {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw new RegistrationNotFoundError();
  if (!(await hasEventAccess(event, user))) throw new RegistrationForbiddenError("forbidden");
  return computeNetProductRevenue(eventId, "PASS");
}

// Выручка по TicketType события (KPI вкладки "Билеты и Pass" → под-вкладка
// "Билеты") — зеркалит getEventPassRevenue() выше, для простых билетов
// вместо Pass.
export async function getEventTicketTypeRevenue(eventId: string, user: User): Promise<number> {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw new RegistrationNotFoundError();
  if (!(await hasEventAccess(event, user))) throw new RegistrationForbiddenError("forbidden");
  return computeNetProductRevenue(eventId, "EVENT_TICKET");
}

// ---------------------------------------------------------------------------
// Межсобытийный Pass фестиваля (этап 3, 2026-09-16) — см. подробный
// комментарий у модели Ticket в schema.prisma. Программа фестиваля состоит
// из пунктов (ProgramItem), часть из которых ссылается на реальные,
// отдельно опубликованные дочерние Event (linkedEventId — party/workshop/
// contest со своей публичной страницей). Pass, купленный НА СОБЫТИИ
// ФЕСТИВАЛЯ, должен давать вход на эти дочерние события — без повторной
// оплаты и без искажения статистики (см. getEventPassRevenue выше).
// ---------------------------------------------------------------------------

export type FestivalPassMatch = {
  passId: string;
  passName: string;
  festivalEventId: string;
};

// Пустой список PassAccessGrant у Pass = доступ ко всему (см. комментарий у
// модели Pass) — Full Pass не обязан явно перечислять каждый пункт
// программы. Общий предикат для findFestivalPassForEvent (доступ к ОДНОМУ
// конкретному дочернему событию) и getMyFestivalAccess в
// festival-member-service.ts (Stage 6, 2026-09-17 — перечисление ВСЕХ
// доступных пунктов программы для личного кабинета участника) — та же
// проверка, не дублируется в двух местах.
export function isProgramItemAccessibleByGrants(grants: { programItemId: string | null }[], programItemId: string): boolean {
  if (grants.length === 0) return true;
  return grants.some((g) => g.programItemId === programItemId);
}

// Ищет действующий Pass, купленный этим танцором на фестивале, к которому
// (через ProgramItem.linkedEvent) относится eventId — и который даёт
// доступ именно к этому пункту программы.
export async function findFestivalPassForEvent(eventId: string, dancerId: string): Promise<FestivalPassMatch | null> {
  const programItem = await prisma.programItem.findFirst({
    where: { linkedEventId: eventId },
    select: { id: true, festival: { select: { eventId: true } } },
  });
  if (!programItem) return null; // это событие не является дочерним ни для одного фестиваля

  const festivalEventId = programItem.festival.eventId;
  // Festival.eventId nullable (черновик без Pass ещё не может продавать —
  // см. docs/FESTIVAL_ENGINE_ER.md) — купить Pass в принципе не на чём,
  // совпадения нет и быть не может.
  if (!festivalEventId) return null;

  const passTicket = await prisma.ticket.findFirst({
    where: {
      eventId: festivalEventId,
      dancerId,
      passId: { not: null },
      status: "ISSUED",
      isPaid: true,
    },
    select: { pass: { select: { id: true, name: true, accessGrants: { select: { programItemId: true } } } } },
  });
  if (!passTicket?.pass) return null;

  if (!isProgramItemAccessibleByGrants(passTicket.pass.accessGrants, programItem.id)) return null;

  return { passId: passTicket.pass.id, passName: passTicket.pass.name, festivalEventId };
}

// Материализует вход на дочернее событие фестиваля как отдельный Ticket
// (eventId = дочернее событие, passId = Pass фестиваля, price = null —
// деньги уже получены при покупке самого Pass, см. комментарий у
// getEventPassRevenue). Идемпотентно — повторный вызов возвращает уже
// созданный Ticket, а не дублирует его (тот же @@unique([dancerId, passId]),
// что и у обычной выдачи Pass).
export async function issueFestivalPassEntry(eventId: string, dancerId: string, user: User): Promise<Ticket> {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw new RegistrationNotFoundError();
  if (!(await hasEventAccess(event, user))) throw new RegistrationForbiddenError("forbidden");

  const match = await findFestivalPassForEvent(eventId, dancerId);
  if (!match) {
    throw new TicketValidationError("no_festival_pass", "У танцора нет действующего Pass фестиваля, дающего доступ к этому событию.");
  }

  // Уникальность теперь включает eventId (@@unique([dancerId, passId,
  // eventId]), см. schema.prisma) — именно поэтому один и тот же Pass может
  // иметь отдельный Ticket на событии фестиваля (реальная покупка) И
  // отдельный производный Ticket здесь, на дочернем событии, не конфликтуя.
  const existing = await prisma.ticket.findUnique({
    where: { dancerId_passId_eventId: { dancerId, passId: match.passId, eventId } },
  });
  if (existing) return existing;

  // Commerce Engine v1 — производный вход ссылается на ТОТ ЖЕ UserPass, что и
  // оригинальная покупка (findFestivalPassForEvent уже требует существующий
  // оплаченный Ticket по этому Pass — значит UserPass для него должен
  // существовать, если не сам issueTicket его завёл, то backfill Phase 2).
  // Не найден — не блокируем материализацию входа (это не денежная операция),
  // просто оставляем userPassId пустым: событие всё равно физически пускает
  // человека, бухгалтерская связка — не то, ради чего организатор жмёт кнопку.
  const userPass = await prisma.userPass.findUnique({ where: { dancerId_passId: { dancerId, passId: match.passId } } });

  return prisma.ticket.create({
    data: {
      eventId,
      passId: match.passId,
      dancerId,
      price: null,
      currency: null,
      isPaid: true,
      paidAt: new Date(),
      issuedById: user.id,
      userPassId: userPass?.id ?? null,
    },
  });
}

// Обёртка issueFestivalPassEntry() по registrationId — тот же паттерн, что
// и markRegistrationPayment (UI работает с регистрацией, не с eventId/
// dancerId напрямую).
export async function issueFestivalPassEntryForRegistration(registrationId: string, user: User): Promise<Ticket> {
  const registration = await prisma.eventRegistration.findUnique({ where: { id: registrationId } });
  if (!registration) throw new RegistrationNotFoundError();
  return issueFestivalPassEntry(registration.eventId, registration.dancerId, user);
}

// Attendance по ЧУЖОМУ Pass фестиваля (в отличие от Revenue выше) — сколько
// раз Pass, купленный НА ДРУГОМ событии (событии фестиваля), использовали
// для входа именно сюда. Отличается от "Продано" в PassManager не по price
// (бесплатный Pass тоже легитимно продаётся напрямую, price=null — это НЕ
// признак производного входа), а структурно: pass.eventId != eventId —
// производный Ticket всегда живёт на дочернем событии, а сам Pass
// принадлежит родительскому. Без этого условия функция ошибочно считала бы
// обычные прямые продажи Pass ЭТОГО ЖЕ события "посещениями по Pass
// фестиваля", задваивая уже показанный где-то ещё "Продано" (найдено вживую:
// у события, которое просто имеет собственный Pass, а не является дочерним
// пунктом программы никакого фестиваля).
export async function getEventPassAttendanceCount(eventId: string, user: User): Promise<number> {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw new RegistrationNotFoundError();
  if (!(await hasEventAccess(event, user))) throw new RegistrationForbiddenError("forbidden");

  return prisma.ticket.count({
    where: { eventId, passId: { not: null }, status: "ISSUED", pass: { eventId: { not: eventId } } },
  });
}
