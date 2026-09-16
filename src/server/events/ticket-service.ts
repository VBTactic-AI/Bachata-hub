import type { Prisma, Ticket, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasEventAccess } from "./access";
import { RegistrationForbiddenError, RegistrationNotFoundError } from "./registration-service";
import { getCurrentPassPrice } from "./pass-service";

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

async function requireAccessForTicket(ticketId: string, user: User) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, include: { event: true } });
  if (!ticket) throw new RegistrationNotFoundError();
  if (!(await hasEventAccess(ticket.event, user))) throw new RegistrationForbiddenError("forbidden");
  return ticket;
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

export async function issueTicket(passId: string, dancerId: string, user: User, options: { markPaid?: boolean } = {}): Promise<Ticket> {
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
    const isFree = effective.price == null || effective.price === 0;

    let ticket: Ticket;
    try {
      ticket = await tx.ticket.create({
        data: {
          eventId: current.eventId,
          passId,
          dancerId,
          price: effective.price,
          currency: effective.currency,
          isPaid: isFree || Boolean(options.markPaid),
          paidAt: isFree || options.markPaid ? new Date() : null,
          issuedById: user.id,
        },
      });
    } catch (err) {
      if ((err as Prisma.PrismaClientKnownRequestError)?.code === "P2002") {
        throw new DuplicateTicketError();
      }
      throw err;
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
  options: { markPaid?: boolean } = {}
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

    const current = await tx.ticketType.findUniqueOrThrow({ where: { id: ticketTypeId } });
    assertOnSale(current);
    if (current.quantity != null && current.soldQuantity >= current.quantity) {
      throw new TicketValidationError("sold_out", "Свободных мест по этому билету больше нет.");
    }
    const price = current.price == null ? null : Number(current.price);
    const isFree = price == null || price === 0;

    let ticket: Ticket;
    try {
      ticket = await tx.ticket.create({
        data: {
          eventId: current.eventId,
          ticketTypeId,
          dancerId,
          price,
          currency: current.currency,
          isPaid: isFree || Boolean(options.markPaid),
          paidAt: isFree || options.markPaid ? new Date() : null,
          issuedById: user.id,
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

export async function cancelTicket(ticketId: string, user: User): Promise<Ticket> {
  const ticket = await requireAccessForTicket(ticketId, user);
  if (ticket.status !== "ISSUED") return ticket; // идемпотентно

  return prisma.$transaction(async (tx) => {
    const updated = await tx.ticket.update({ where: { id: ticketId }, data: { status: "CANCELLED", cancelledAt: new Date() } });
    await releaseSlot(tx, ticket);
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
};

// Только ISSUED — отменённые/возвращённые билеты не участвуют в подсчёте
// "оплачено ли событие для этого танцора" (они больше не действительны).
export async function listTicketsByDancerForEvent(eventId: string, dancerIds: string[]): Promise<Map<string, DancerTicketInfo[]>> {
  const map = new Map<string, DancerTicketInfo[]>();
  if (dancerIds.length === 0) return map;

  const tickets = await prisma.ticket.findMany({
    where: { eventId, dancerId: { in: dancerIds }, status: "ISSUED" },
    include: { pass: { select: { name: true } }, ticketType: { select: { name: true } } },
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

// Выручка по Pass-билетам события (KPI вкладки "Билеты") — сумма цены
// оплаченных, действующих (ISSUED) билетов, привязанных к Pass. Passless
// билеты сюда не входят — у события без Pass нет вкладки "Билеты" вообще.
//
// ВАЖНО (этап 3, межсобытийный Pass фестиваля) — этот запрос сознательно НЕ
// требует price > 0, только price IS NOT NULL. "Производные" Ticket с
// дочерних событий фестиваля (см. resolveFestivalPassEntry ниже) имеют
// price = null именно для того, чтобы НЕ попадать сюда повторно — Revenue
// считает только сам факт продажи Pass (один раз, на событии фестиваля), не
// каждое посещение по нему (см. Attendance — getEventPassAttendanceCount).
export async function getEventPassRevenue(eventId: string, user: User): Promise<number> {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw new RegistrationNotFoundError();
  if (!(await hasEventAccess(event, user))) throw new RegistrationForbiddenError("forbidden");

  const paid = await prisma.ticket.findMany({
    where: { eventId, passId: { not: null }, isPaid: true, status: "ISSUED" },
    select: { price: true },
  });
  return paid.reduce((sum, t) => sum + (t.price == null ? 0 : Number(t.price)), 0);
}

// Выручка по TicketType события (KPI вкладки "Билеты и Pass" → под-вкладка
// "Билеты") — зеркалит getEventPassRevenue() выше, для простых билетов
// вместо Pass.
export async function getEventTicketTypeRevenue(eventId: string, user: User): Promise<number> {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw new RegistrationNotFoundError();
  if (!(await hasEventAccess(event, user))) throw new RegistrationForbiddenError("forbidden");

  const paid = await prisma.ticket.findMany({
    where: { eventId, ticketTypeId: { not: null }, isPaid: true, status: "ISSUED" },
    select: { price: true },
  });
  return paid.reduce((sum, t) => sum + (t.price == null ? 0 : Number(t.price)), 0);
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

// Ищет действующий Pass, купленный этим танцором на фестивале, к которому
// (через ProgramItem.linkedEvent) относится eventId — и который даёт
// доступ именно к этому пункту программы. Пустой PassAccessGrant у Pass =
// доступ ко всему (см. комментарий у модели Pass), поэтому Full Pass не
// обязан явно перечислять каждый пункт программы.
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

  const grants = passTicket.pass.accessGrants;
  const unrestricted = grants.length === 0;
  const grantsThisItem = grants.some((g) => g.programItemId === programItem.id);
  if (!unrestricted && !grantsThisItem) return null;

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
