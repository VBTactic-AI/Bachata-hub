import { describe, it, expect, vi, beforeEach } from "vitest";
import type { User } from "@prisma/client";

// Ticket Engine (2026-09-16). Управление билетами — hasEventAccess (владелец/
// ADMIN/член команды), в отличие от pass-service.ts (isOwnerOrAdmin) — см.
// комментарий в ticket-service.ts.

const eventFindUnique = vi.fn();
const passFindUnique = vi.fn();
const ticketTypeFindUnique = vi.fn(); // requireAccessForTicketType
const dancerFindUnique = vi.fn();
const ticketFindUnique = vi.fn(); // requireAccessForTicket / issueFestivalPassEntry existing lookup
const ticketFindMany = vi.fn();
const ticketFindFirst = vi.fn(); // findFestivalPassForEvent
const ticketCreate = vi.fn(); // issueFestivalPassEntry (вне транзакции)
const ticketCount = vi.fn(); // getEventPassAttendanceCount
const programItemFindFirst = vi.fn(); // findFestivalPassForEvent
const eventRegistrationFindUnique = vi.fn(); // markRegistrationPayment/listTicketsForRegistration
const eventTeamMemberFindUnique = vi.fn(); // hasEventAccess
const userPassFindUnique = vi.fn(); // issueFestivalPassEntry (вне транзакции)
const orderItemFindMany = vi.fn(); // computeNetProductRevenue (getEventPassRevenue/getEventTicketTypeRevenue)

const executeRaw = vi.fn().mockResolvedValue(0);
const txPassFindUniqueOrThrow = vi.fn();
const txPassUpdate = vi.fn();
const txTicketTypeFindUniqueOrThrow = vi.fn();
const txTicketTypeUpdate = vi.fn();
const txTicketCreate = vi.fn();
const txTicketUpdate = vi.fn();
const txTicketFindFirst = vi.fn();
const txPassPriceTierFindMany = vi.fn();
const txFestivalFindUnique = vi.fn(); // referralCode — festival() bridge lookup внутри issueTicket
const txReferralCodeFindUnique = vi.fn();
// Commerce Engine v1 (2026-09-17) — Order/OrderItem/Payment/Refund/UserPass/
// Product внутри той же транзакции, что и сам Ticket (см. ticket-service.ts).
const txProductFindUnique = vi.fn();
const txUserPassUpsert = vi.fn();
const txUserPassUpdate = vi.fn();
const txUserPassFindUnique = vi.fn();
const txOrderCreate = vi.fn();
const txOrderUpdate = vi.fn();
const txOrderFindUniqueOrThrow = vi.fn();
const txOrderItemCreate = vi.fn();
const txOrderItemFindUnique = vi.fn();
const txPaymentCreate = vi.fn();
const txRefundCreate = vi.fn();
// Commerce Engine v1 (2026-09-18) — применение скидки PromoCode внутри
// issueTicket (см. ticket-service.ts).
const txPromoCodeFindUnique = vi.fn();
const txPromoCodeUpdate = vi.fn();

const fakeTx = {
  $executeRaw: executeRaw,
  pass: { findUniqueOrThrow: txPassFindUniqueOrThrow, update: txPassUpdate },
  ticketType: { findUniqueOrThrow: txTicketTypeFindUniqueOrThrow, update: txTicketTypeUpdate },
  ticket: { create: txTicketCreate, update: txTicketUpdate, findFirst: txTicketFindFirst },
  passPriceTier: { findMany: txPassPriceTierFindMany },
  festival: { findUnique: txFestivalFindUnique },
  festivalReferralCode: { findUnique: txReferralCodeFindUnique },
  product: { findUnique: txProductFindUnique },
  userPass: { upsert: txUserPassUpsert, update: txUserPassUpdate, findUnique: txUserPassFindUnique },
  order: { create: txOrderCreate, update: txOrderUpdate, findUniqueOrThrow: txOrderFindUniqueOrThrow },
  orderItem: { create: txOrderItemCreate, findUnique: txOrderItemFindUnique },
  payment: { create: txPaymentCreate },
  refund: { create: txRefundCreate },
  promoCode: { findUnique: txPromoCodeFindUnique, update: txPromoCodeUpdate },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    event: { findUnique: (...a: unknown[]) => eventFindUnique(...a) },
    pass: { findUnique: (...a: unknown[]) => passFindUnique(...a) },
    ticketType: { findUnique: (...a: unknown[]) => ticketTypeFindUnique(...a) },
    dancer: { findUnique: (...a: unknown[]) => dancerFindUnique(...a) },
    ticket: {
      findUnique: (...a: unknown[]) => ticketFindUnique(...a),
      findMany: (...a: unknown[]) => ticketFindMany(...a),
      findFirst: (...a: unknown[]) => ticketFindFirst(...a),
      create: (...a: unknown[]) => ticketCreate(...a),
      count: (...a: unknown[]) => ticketCount(...a),
    },
    programItem: { findFirst: (...a: unknown[]) => programItemFindFirst(...a) },
    eventRegistration: { findUnique: (...a: unknown[]) => eventRegistrationFindUnique(...a) },
    eventTeamMember: { findUnique: (...a: unknown[]) => eventTeamMemberFindUnique(...a) },
    userPass: { findUnique: (...a: unknown[]) => userPassFindUnique(...a) },
    orderItem: { findMany: (...a: unknown[]) => orderItemFindMany(...a) },
    $transaction: (fn: (tx: typeof fakeTx) => unknown) => fn(fakeTx),
  },
}));

const {
  issueTicket,
  issueTicketForType,
  updateTicketPayment,
  cancelTicket,
  refundTicket,
  listTicketsByDancerForEvent,
  summarizePayment,
  getEventPaymentSummaryCounts,
  markRegistrationPayment,
  listTicketsForRegistration,
  getEventTicketTypeRevenue,
  getEventPassRevenue,
  findFestivalPassForEvent,
  issueFestivalPassEntry,
  getEventPassAttendanceCount,
  isProgramItemAccessibleByGrants,
  TicketValidationError,
  DuplicateTicketError,
  computePromoDiscount,
} = await import("@/server/events/ticket-service");
const { RegistrationForbiddenError, RegistrationNotFoundError } = await import("@/server/events/registration-service");

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "owner1",
    email: "owner@example.com",
    passwordHash: null,
    supabaseUserId: null,
    role: "ORGANIZER",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastLoginAt: null,
    isBlocked: false,
    isVerifiedEventOrganizer: false,
    isVerifiedFestivalOrganizer: false,
    ...overrides,
  };
}

const event = { id: "event1", createdById: "owner1" };
const owner = makeUser();
const activePass = {
  id: "pass1",
  eventId: "event1",
  name: "Full Pass",
  status: "ACTIVE" as const,
  price: 120,
  currency: "BYN",
  quantity: 10,
  soldQuantity: 0,
  salesStartAt: null as Date | null,
  salesEndAt: null as Date | null,
};
const activeTicketType = {
  id: "tt1",
  eventId: "event1",
  name: "Dancer",
  status: "ACTIVE" as const,
  price: 15,
  currency: "BYN",
  quantity: 10,
  soldQuantity: 0,
  salesStartAt: null as Date | null,
  salesEndAt: null as Date | null,
};

beforeEach(() => {
  eventFindUnique.mockReset().mockResolvedValue(event);
  passFindUnique.mockReset().mockResolvedValue({ ...activePass, event });
  ticketTypeFindUnique.mockReset().mockResolvedValue({ ...activeTicketType, event });
  dancerFindUnique.mockReset().mockResolvedValue({ id: "dancer1" });
  ticketFindUnique.mockReset();
  ticketFindMany.mockReset().mockResolvedValue([]);
  ticketFindFirst.mockReset().mockResolvedValue(null);
  ticketCreate.mockReset().mockResolvedValue({ id: "derived-ticket" });
  ticketCount.mockReset().mockResolvedValue(0);
  programItemFindFirst.mockReset().mockResolvedValue(null);
  // По умолчанию танцор уже зарегистрирован на событие (issueTicket это
  // требует, 2026-09-16) — тесты, которым конкретно нужен другой случай,
  // переопределяют этот мок сами.
  eventRegistrationFindUnique.mockReset().mockResolvedValue({ id: "reg1", eventId: "event1", dancerId: "dancer1", status: "REGISTERED" });
  eventTeamMemberFindUnique.mockReset().mockResolvedValue(null);
  executeRaw.mockClear();
  txPassPriceTierFindMany.mockReset().mockResolvedValue([]);
  txPassFindUniqueOrThrow.mockReset().mockResolvedValue(activePass);
  txPassUpdate.mockReset().mockImplementation((args) => Promise.resolve({ ...activePass, ...args.data }));
  txTicketTypeFindUniqueOrThrow.mockReset().mockResolvedValue(activeTicketType);
  txTicketTypeUpdate.mockReset().mockImplementation((args) => Promise.resolve({ ...activeTicketType, ...args.data }));
  txTicketCreate.mockReset().mockResolvedValue({ id: "ticket1", passId: "pass1", dancerId: "dancer1", isPaid: false });
  txTicketUpdate.mockReset().mockImplementation((args) => Promise.resolve({ id: "ticket1", ...args.data }));
  txTicketFindFirst.mockReset().mockResolvedValue(null);
  txFestivalFindUnique.mockReset().mockResolvedValue(null);
  txReferralCodeFindUnique.mockReset().mockResolvedValue(null);
  // Commerce Engine v1 — дефолты для нового Order/OrderItem/Payment/Refund/
  // UserPass/Product слоя (см. ticket-service.ts). Тесты cancelTicket/
  // refundTicket, чьи ticket-моки не задают orderItemId/userPassId, вообще не
  // достают до этих вызовов (findOrderIdForTicketInTx возвращает null раньше).
  txProductFindUnique.mockReset().mockResolvedValue({ id: "product1" });
  txUserPassUpsert.mockReset().mockResolvedValue({ id: "userpass1", orderItemId: null });
  txUserPassUpdate.mockReset().mockImplementation((args) => Promise.resolve({ id: args.where.id, ...args.data }));
  txUserPassFindUnique.mockReset().mockResolvedValue(null);
  txOrderCreate.mockReset().mockImplementation((args) => Promise.resolve({ id: "order1", ...args.data }));
  txOrderUpdate.mockReset().mockImplementation((args) => Promise.resolve({ id: args.where.id, ...args.data }));
  txOrderFindUniqueOrThrow.mockReset().mockResolvedValue({
    id: "order1",
    payments: [{ id: "payment1", amount: 120, currency: "BYN", status: "PAID" }],
  });
  txOrderItemCreate.mockReset().mockImplementation((args) => Promise.resolve({ id: "orderitem1", ...args.data }));
  txOrderItemFindUnique.mockReset().mockResolvedValue(null);
  txPaymentCreate.mockReset().mockImplementation((args) => Promise.resolve({ id: "payment1", ...args.data }));
  txRefundCreate.mockReset().mockImplementation((args) => Promise.resolve({ id: "refund1", ...args.data }));
  userPassFindUnique.mockReset().mockResolvedValue(null);
  orderItemFindMany.mockReset().mockResolvedValue([]);
  txPromoCodeFindUnique.mockReset().mockResolvedValue(null);
  txPromoCodeUpdate.mockReset().mockImplementation((args) => Promise.resolve({ id: args.where.id, ...args.data }));
});

describe("issueTicket()", () => {
  it("чужое событие, не ADMIN/не член команды — RegistrationForbiddenError", async () => {
    passFindUnique.mockResolvedValue({ ...activePass, event: { id: "event1", createdById: "someone-else" } });
    await expect(issueTicket("pass1", "dancer1", owner)).rejects.toBeInstanceOf(RegistrationForbiddenError);
    expect(txTicketCreate).not.toHaveBeenCalled();
  });

  it("Pass не найден — RegistrationNotFoundError", async () => {
    passFindUnique.mockResolvedValue(null);
    await expect(issueTicket("missing", "dancer1", owner)).rejects.toBeInstanceOf(RegistrationNotFoundError);
  });

  it("Dancer не найден — RegistrationNotFoundError", async () => {
    dancerFindUnique.mockResolvedValue(null);
    await expect(issueTicket("pass1", "missing", owner)).rejects.toBeInstanceOf(RegistrationNotFoundError);
  });

  it("танцор ещё не регистрировался на событие (нет EventRegistration) — TicketValidationError('not_registered')", async () => {
    eventRegistrationFindUnique.mockResolvedValue(null);
    await expect(issueTicket("pass1", "dancer1", owner)).rejects.toMatchObject({ code: "not_registered" });
    expect(txTicketCreate).not.toHaveBeenCalled();
  });

  it("регистрация CANCELLED (сам отменился) — Pass выдать нельзя, TicketValidationError('not_registered')", async () => {
    eventRegistrationFindUnique.mockResolvedValue({ id: "reg1", eventId: "event1", dancerId: "dancer1", status: "CANCELLED" });
    await expect(issueTicket("pass1", "dancer1", owner)).rejects.toMatchObject({ code: "not_registered" });
  });

  it("регистрация REJECTED — Pass выдать нельзя", async () => {
    eventRegistrationFindUnique.mockResolvedValue({ id: "reg1", eventId: "event1", dancerId: "dancer1", status: "REJECTED" });
    await expect(issueTicket("pass1", "dancer1", owner)).rejects.toMatchObject({ code: "not_registered" });
  });

  it("регистрация REGISTERED/CONFIRMED/WAITLIST — Pass выдать можно", async () => {
    for (const status of ["REGISTERED", "CONFIRMED", "WAITLIST"]) {
      txTicketCreate.mockReset().mockResolvedValue({ id: "ticket1" });
      eventRegistrationFindUnique.mockResolvedValue({ id: "reg1", eventId: "event1", dancerId: "dancer1", status });
      await expect(issueTicket("pass1", "dancer1", owner)).resolves.toBeDefined();
    }
  });

  it("Pass не ACTIVE (например PAUSED) — TicketValidationError('pass_not_on_sale')", async () => {
    txPassFindUniqueOrThrow.mockResolvedValue({ ...activePass, status: "PAUSED" });
    await expect(issueTicket("pass1", "dancer1", owner)).rejects.toMatchObject({ code: "pass_not_on_sale" });
    expect(txTicketCreate).not.toHaveBeenCalled();
  });

  it("продажи ещё не начались — TicketValidationError('sales_not_started')", async () => {
    txPassFindUniqueOrThrow.mockResolvedValue({ ...activePass, salesStartAt: new Date(Date.now() + 86_400_000) });
    await expect(issueTicket("pass1", "dancer1", owner)).rejects.toMatchObject({ code: "sales_not_started" });
  });

  it("продажи уже закончились — TicketValidationError('sales_ended')", async () => {
    txPassFindUniqueOrThrow.mockResolvedValue({ ...activePass, salesEndAt: new Date(Date.now() - 86_400_000) });
    await expect(issueTicket("pass1", "dancer1", owner)).rejects.toMatchObject({ code: "sales_ended" });
  });

  it("Pass уже SOLD_OUT (обычный путь после авто-переключения статуса) — TicketValidationError('sold_out'), не общее 'не в продаже'", async () => {
    txPassFindUniqueOrThrow.mockResolvedValue({ ...activePass, status: "SOLD_OUT", quantity: 10, soldQuantity: 10 });
    await expect(issueTicket("pass1", "dancer1", owner)).rejects.toMatchObject({ code: "sold_out" });
    expect(txTicketCreate).not.toHaveBeenCalled();
  });

  it("мест больше нет (soldQuantity >= quantity) — TicketValidationError('sold_out'), нельзя продать больше лимита", async () => {
    txPassFindUniqueOrThrow.mockResolvedValue({ ...activePass, quantity: 10, soldQuantity: 10 });
    await expect(issueTicket("pass1", "dancer1", owner)).rejects.toMatchObject({ code: "sold_out" });
    expect(txTicketCreate).not.toHaveBeenCalled();
  });

  it("повторная покупка того же Pass тем же танцором (P2002) — DuplicateTicketError", async () => {
    txTicketCreate.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));
    await expect(issueTicket("pass1", "dancer1", owner)).rejects.toBeInstanceOf(DuplicateTicketError);
  });

  it("бесплатный Pass (price=null) — Ticket выдаётся сразу оплаченным, независимо от markPaid", async () => {
    txPassFindUniqueOrThrow.mockResolvedValue({ ...activePass, price: null });
    await issueTicket("pass1", "dancer1", owner, { markPaid: false });
    expect(txTicketCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ isPaid: true, paidAt: expect.any(Date) }),
    });
  });

  it("бесплатный Pass (price=0) — тоже сразу оплачен", async () => {
    txPassFindUniqueOrThrow.mockResolvedValue({ ...activePass, price: 0 });
    await issueTicket("pass1", "dancer1", owner);
    expect(txTicketCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ isPaid: true }) });
  });

  it("платный Pass, markPaid не передан — isPaid=false (не создаёт ошибочный payment)", async () => {
    await issueTicket("pass1", "dancer1", owner);
    expect(txTicketCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ isPaid: false, paidAt: null }) });
  });

  it("платный Pass, markPaid=true — организатор уже получил деньги при выдаче", async () => {
    await issueTicket("pass1", "dancer1", owner, { markPaid: true });
    expect(txTicketCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ isPaid: true, paidAt: expect.any(Date) }) });
  });

  it("выдача снимка цены/валюты Pass на Ticket + issuedById", async () => {
    await issueTicket("pass1", "dancer1", owner);
    expect(txTicketCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ eventId: "event1", passId: "pass1", dancerId: "dancer1", price: 120, currency: "BYN", issuedById: "owner1" }),
    });
  });

  it("успешная выдача — инкрементирует Pass.soldQuantity", async () => {
    await issueTicket("pass1", "dancer1", owner);
    expect(txPassUpdate).toHaveBeenCalledWith({ where: { id: "pass1" }, data: { soldQuantity: { increment: 1 } } });
  });

  it("после выдачи последнего места — Pass.status переключается в SOLD_OUT", async () => {
    txPassFindUniqueOrThrow.mockResolvedValue({ ...activePass, quantity: 5, soldQuantity: 4 });
    txPassUpdate.mockResolvedValueOnce({ ...activePass, quantity: 5, soldQuantity: 5, status: "ACTIVE" });

    await issueTicket("pass1", "dancer1", owner);

    expect(txPassUpdate).toHaveBeenCalledWith({ where: { id: "pass1" }, data: { status: "SOLD_OUT" } });
  });

  it("остаются свободные места — Pass.status НЕ переключается в SOLD_OUT", async () => {
    txPassFindUniqueOrThrow.mockResolvedValue({ ...activePass, quantity: 5, soldQuantity: 2 });
    txPassUpdate.mockResolvedValueOnce({ ...activePass, quantity: 5, soldQuantity: 3, status: "ACTIVE" });

    await issueTicket("pass1", "dancer1", owner);

    expect(txPassUpdate).not.toHaveBeenCalledWith({ where: { id: "pass1" }, data: { status: "SOLD_OUT" } });
  });
});

describe("issueTicket() — реферальный код (Stage 4 Festival Engine, 2026-09-17)", () => {
  const activeReferralCode = {
    id: "ref1",
    festivalId: "fest1",
    code: "TEACHER10",
    discountValue: 10,
    commissionValue: 15,
    active: true,
    startsAt: null as Date | null,
    expiresAt: null as Date | null,
  };

  it("код не передан — referralCodeId/снимки не заполняются", async () => {
    await issueTicket("pass1", "dancer1", owner);
    expect(txFestivalFindUnique).not.toHaveBeenCalled();
    expect(txTicketCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ referralCodeId: null, referralDiscountAmount: null, referralCommissionAmount: null }),
    });
  });

  it("Pass не принадлежит ни одному фестивалю (bridge-Event не найден) — invalid_referral_code", async () => {
    txFestivalFindUnique.mockResolvedValue(null);
    await expect(issueTicket("pass1", "dancer1", owner, { referralCode: "TEACHER10" })).rejects.toMatchObject({
      code: "invalid_referral_code",
    });
    expect(txTicketCreate).not.toHaveBeenCalled();
  });

  it("код не найден у фестиваля — invalid_referral_code", async () => {
    txFestivalFindUnique.mockResolvedValue({ id: "fest1" });
    txReferralCodeFindUnique.mockResolvedValue(null);
    await expect(issueTicket("pass1", "dancer1", owner, { referralCode: "MISSING" })).rejects.toMatchObject({
      code: "invalid_referral_code",
    });
  });

  it("код неактивен (active=false) — invalid_referral_code", async () => {
    txFestivalFindUnique.mockResolvedValue({ id: "fest1" });
    txReferralCodeFindUnique.mockResolvedValue({ ...activeReferralCode, active: false });
    await expect(issueTicket("pass1", "dancer1", owner, { referralCode: "TEACHER10" })).rejects.toMatchObject({
      code: "invalid_referral_code",
    });
  });

  it("код ещё не начал действовать (startsAt в будущем) — invalid_referral_code", async () => {
    txFestivalFindUnique.mockResolvedValue({ id: "fest1" });
    txReferralCodeFindUnique.mockResolvedValue({ ...activeReferralCode, startsAt: new Date(Date.now() + 86_400_000) });
    await expect(issueTicket("pass1", "dancer1", owner, { referralCode: "TEACHER10" })).rejects.toMatchObject({
      code: "invalid_referral_code",
    });
  });

  it("код уже истёк (expiresAt в прошлом) — invalid_referral_code", async () => {
    txFestivalFindUnique.mockResolvedValue({ id: "fest1" });
    txReferralCodeFindUnique.mockResolvedValue({ ...activeReferralCode, expiresAt: new Date(Date.now() - 86_400_000) });
    await expect(issueTicket("pass1", "dancer1", owner, { referralCode: "TEACHER10" })).rejects.toMatchObject({
      code: "invalid_referral_code",
    });
  });

  it("действующий код — ищется по (festivalId фестиваля этого Pass, код в верхнем регистре), снимок на Ticket", async () => {
    txFestivalFindUnique.mockResolvedValue({ id: "fest1" });
    txReferralCodeFindUnique.mockResolvedValue(activeReferralCode);

    await issueTicket("pass1", "dancer1", owner, { referralCode: "teacher10" });

    expect(txFestivalFindUnique).toHaveBeenCalledWith({ where: { eventId: "event1" } });
    expect(txReferralCodeFindUnique).toHaveBeenCalledWith({
      where: { festivalId_code: { festivalId: "fest1", code: "TEACHER10" } },
    });
    expect(txTicketCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ referralCodeId: "ref1", referralDiscountAmount: 10, referralCommissionAmount: 15 }),
    });
  });
});

describe("cancelTicket() / refundTicket()", () => {
  it("cancelTicket — чужое событие — RegistrationForbiddenError", async () => {
    ticketFindUnique.mockResolvedValue({ id: "ticket1", status: "ISSUED", passId: "pass1", event: { id: "event1", createdById: "someone-else" } });
    await expect(cancelTicket("ticket1", owner)).rejects.toBeInstanceOf(RegistrationForbiddenError);
  });

  it("cancelTicket — уже CANCELLED — идемпотентно, update не вызывается", async () => {
    ticketFindUnique.mockResolvedValue({ id: "ticket1", status: "CANCELLED", passId: "pass1", event });
    const result = await cancelTicket("ticket1", owner);
    expect(result.status).toBe("CANCELLED");
    expect(txTicketUpdate).not.toHaveBeenCalled();
  });

  it("cancelTicket — ISSUED с Pass — отменяет и освобождает место (decrement + реактивация если был SOLD_OUT)", async () => {
    ticketFindUnique.mockResolvedValue({ id: "ticket1", status: "ISSUED", passId: "pass1", event });
    txTicketUpdate.mockResolvedValue({ id: "ticket1", status: "CANCELLED" });
    txPassUpdate.mockResolvedValueOnce({ ...activePass, status: "SOLD_OUT", quantity: 10, soldQuantity: 9 });

    await cancelTicket("ticket1", owner);

    expect(txTicketUpdate).toHaveBeenCalledWith({ where: { id: "ticket1" }, data: { status: "CANCELLED", cancelledAt: expect.any(Date) } });
    expect(txPassUpdate).toHaveBeenCalledWith({ where: { id: "pass1" }, data: { soldQuantity: { decrement: 1 } } });
    expect(txPassUpdate).toHaveBeenCalledWith({ where: { id: "pass1" }, data: { status: "ACTIVE" } });
  });

  it("cancelTicket — passless (passId=null) — отменяет БЕЗ обращения к Pass", async () => {
    ticketFindUnique.mockResolvedValue({ id: "ticket1", status: "ISSUED", passId: null, event });
    await cancelTicket("ticket1", owner);
    expect(txPassUpdate).not.toHaveBeenCalled();
  });

  it("refundTicket — билет не оплачен — TicketValidationError('not_paid')", async () => {
    ticketFindUnique.mockResolvedValue({ id: "ticket1", status: "ISSUED", isPaid: false, passId: "pass1", event });
    await expect(refundTicket("ticket1", owner)).rejects.toMatchObject({ code: "not_paid" });
    expect(txTicketUpdate).not.toHaveBeenCalled();
  });

  it("refundTicket — уже CANCELLED — TicketValidationError('cannot_refund_cancelled')", async () => {
    ticketFindUnique.mockResolvedValue({ id: "ticket1", status: "CANCELLED", isPaid: false, passId: "pass1", event });
    await expect(refundTicket("ticket1", owner)).rejects.toMatchObject({ code: "cannot_refund_cancelled" });
  });

  it("refundTicket — уже REFUNDED — идемпотентно", async () => {
    ticketFindUnique.mockResolvedValue({ id: "ticket1", status: "REFUNDED", isPaid: true, passId: "pass1", event });
    const result = await refundTicket("ticket1", owner);
    expect(result.status).toBe("REFUNDED");
    expect(txTicketUpdate).not.toHaveBeenCalled();
  });

  it("refundTicket — оплаченный ISSUED — оформляет возврат и освобождает место", async () => {
    ticketFindUnique.mockResolvedValue({ id: "ticket1", status: "ISSUED", isPaid: true, passId: "pass1", event });
    txTicketUpdate.mockResolvedValue({ id: "ticket1", status: "REFUNDED" });

    await refundTicket("ticket1", owner);

    expect(txTicketUpdate).toHaveBeenCalledWith({ where: { id: "ticket1" }, data: { status: "REFUNDED", cancelledAt: expect.any(Date) } });
    expect(txPassUpdate).toHaveBeenCalledWith({ where: { id: "pass1" }, data: { soldQuantity: { decrement: 1 } } });
  });
});

describe("updateTicketPayment()", () => {
  it("чужое событие — RegistrationForbiddenError", async () => {
    ticketFindUnique.mockResolvedValue({ id: "ticket1", event: { id: "event1", createdById: "someone-else" } });
    await expect(updateTicketPayment("ticket1", owner, true)).rejects.toBeInstanceOf(RegistrationForbiddenError);
  });
});

describe("listTicketsByDancerForEvent() / summarizePayment()", () => {
  it("пустой список dancerIds — пустой Map, запрос не выполняется", async () => {
    const result = await listTicketsByDancerForEvent("event1", []);
    expect(result.size).toBe(0);
    expect(ticketFindMany).not.toHaveBeenCalled();
  });

  it("группирует билеты по dancerId, только ISSUED", async () => {
    ticketFindMany.mockResolvedValue([
      { id: "t1", dancerId: "d1", passId: "p1", ticketTypeId: null, isPaid: true, pass: { name: "Full Pass" } },
      { id: "t2", dancerId: "d1", passId: "p2", ticketTypeId: null, isPaid: false, pass: { name: "VIP Pass" } },
      { id: "t3", dancerId: "d2", passId: null, ticketTypeId: null, isPaid: true, pass: null },
    ]);

    const result = await listTicketsByDancerForEvent("event1", ["d1", "d2"]);

    expect(ticketFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { eventId: "event1", dancerId: { in: ["d1", "d2"] }, status: "ISSUED" } })
    );
    expect(result.get("d1")).toEqual([
      { id: "t1", passId: "p1", passName: "Full Pass", ticketTypeId: null, ticketTypeName: null, isPaid: true, checkedIn: false },
      { id: "t2", passId: "p2", passName: "VIP Pass", ticketTypeId: null, ticketTypeName: null, isPaid: false, checkedIn: false },
    ]);
    expect(result.get("d2")).toEqual([
      { id: "t3", passId: null, passName: null, ticketTypeId: null, ticketTypeName: null, isPaid: true, checkedIn: false },
    ]);
  });

  it("группирует билеты с TicketType наравне с Pass", async () => {
    ticketFindMany.mockResolvedValue([
      { id: "t1", dancerId: "d1", passId: null, ticketTypeId: "tt1", isPaid: true, pass: null, ticketType: { name: "Dancer" } },
    ]);

    const result = await listTicketsByDancerForEvent("event1", ["d1"]);

    expect(result.get("d1")).toEqual([
      { id: "t1", passId: null, passName: null, ticketTypeId: "tt1", ticketTypeName: "Dancer", isPaid: true, checkedIn: false },
    ]);
  });

  it("билет с TicketCheckIn — checkedIn: true", async () => {
    ticketFindMany.mockResolvedValue([
      { id: "t1", dancerId: "d1", passId: "p1", ticketTypeId: null, isPaid: true, pass: { name: "Full Pass" }, checkIn: { id: "checkin1" } },
    ]);

    const result = await listTicketsByDancerForEvent("event1", ["d1"]);

    expect(result.get("d1")).toEqual([
      { id: "t1", passId: "p1", passName: "Full Pass", ticketTypeId: null, ticketTypeName: null, isPaid: true, checkedIn: true },
    ]);
  });

  it("summarizePayment: нет билетов — UNPAID", () => {
    expect(summarizePayment(undefined)).toBe("UNPAID");
    expect(summarizePayment([])).toBe("UNPAID");
  });

  it("summarizePayment: все оплачены — PAID", () => {
    expect(
      summarizePayment([{ id: "1", passId: null, passName: null, ticketTypeId: null, ticketTypeName: null, isPaid: true, checkedIn: false }])
    ).toBe("PAID");
  });

  it("summarizePayment: часть оплачена — PARTIAL", () => {
    expect(
      summarizePayment([
        { id: "1", passId: null, passName: null, ticketTypeId: null, ticketTypeName: null, isPaid: true, checkedIn: false },
        { id: "2", passId: null, passName: null, ticketTypeId: null, ticketTypeName: null, isPaid: false, checkedIn: false },
      ])
    ).toBe("PARTIAL");
  });

  it("summarizePayment: ничего не оплачено — UNPAID", () => {
    expect(
      summarizePayment([{ id: "1", passId: null, passName: null, ticketTypeId: null, ticketTypeName: null, isPaid: false, checkedIn: false }])
    ).toBe("UNPAID");
  });
});

describe("getEventPaymentSummaryCounts()", () => {
  it("считает paid/partial/unpaid по каждому dancerId", async () => {
    ticketFindMany.mockResolvedValue([
      { id: "t1", dancerId: "paid-dancer", passId: null, isPaid: true, pass: null },
      { id: "t2", dancerId: "partial-dancer", passId: "p1", isPaid: true, pass: { name: "A" } },
      { id: "t3", dancerId: "partial-dancer", passId: "p2", isPaid: false, pass: { name: "B" } },
    ]);

    const result = await getEventPaymentSummaryCounts("event1", ["paid-dancer", "partial-dancer", "unpaid-dancer"]);

    expect(result).toEqual({ paidCount: 1, partialCount: 1, unpaidCount: 1 });
  });
});

describe("markRegistrationPayment() — событие без Pass (passless Ticket)", () => {
  it("чужое событие — RegistrationForbiddenError", async () => {
    eventRegistrationFindUnique.mockResolvedValue({ id: "reg1", eventId: "event1", dancerId: "dancer1", event: { id: "event1", createdById: "someone-else" } });
    await expect(markRegistrationPayment("reg1", owner, true)).rejects.toBeInstanceOf(RegistrationForbiddenError);
  });

  it("регистрация не найдена — RegistrationNotFoundError", async () => {
    eventRegistrationFindUnique.mockResolvedValue(null);
    await expect(markRegistrationPayment("missing", owner, true)).rejects.toBeInstanceOf(RegistrationNotFoundError);
  });

  it("билета ещё нет, isPaid=false — no-op, ничего не создаётся (нет тикета = не оплачено)", async () => {
    eventRegistrationFindUnique.mockResolvedValue({ id: "reg1", eventId: "event1", dancerId: "dancer1", event });
    txTicketFindFirst.mockResolvedValue(null);

    const result = await markRegistrationPayment("reg1", owner, false);

    expect(result).toBeNull();
    expect(txTicketCreate).not.toHaveBeenCalled();
  });

  it("билета ещё нет, isPaid=true — заводит passless Ticket, сразу оплаченный", async () => {
    eventRegistrationFindUnique.mockResolvedValue({ id: "reg1", eventId: "event1", dancerId: "dancer1", event });
    txTicketFindFirst.mockResolvedValue(null);

    await markRegistrationPayment("reg1", owner, true);

    expect(txTicketCreate).toHaveBeenCalledWith({
      data: {
        eventId: "event1",
        dancerId: "dancer1",
        passId: null,
        ticketTypeId: null,
        status: "ISSUED",
        isPaid: true,
        paidAt: expect.any(Date),
        issuedById: "owner1",
      },
    });
  });

  it("билет уже есть — обновляет его isPaid/paidAt, новый не создаётся", async () => {
    eventRegistrationFindUnique.mockResolvedValue({ id: "reg1", eventId: "event1", dancerId: "dancer1", event });
    txTicketFindFirst.mockResolvedValue({ id: "existing-ticket" });

    await markRegistrationPayment("reg1", owner, false);

    expect(txTicketUpdate).toHaveBeenCalledWith({ where: { id: "existing-ticket" }, data: { isPaid: false, paidAt: null } });
    expect(txTicketCreate).not.toHaveBeenCalled();
  });
});

describe("listTicketsForRegistration()", () => {
  it("чужое событие — RegistrationForbiddenError", async () => {
    eventRegistrationFindUnique.mockResolvedValue({ id: "reg1", eventId: "event1", dancerId: "dancer1", event: { id: "event1", createdById: "someone-else" } });
    await expect(listTicketsForRegistration("reg1", owner)).rejects.toBeInstanceOf(RegistrationForbiddenError);
  });

  it("возвращает билеты этого танцора по событию", async () => {
    eventRegistrationFindUnique.mockResolvedValue({ id: "reg1", eventId: "event1", dancerId: "dancer1", event });
    ticketFindMany.mockResolvedValue([{ id: "t1", dancerId: "dancer1", passId: "p1", ticketTypeId: null, isPaid: true, pass: { name: "Full Pass" } }]);

    const result = await listTicketsForRegistration("reg1", owner);

    expect(result).toEqual([{ id: "t1", passId: "p1", passName: "Full Pass", ticketTypeId: null, ticketTypeName: null, isPaid: true, checkedIn: false }]);
  });
});

describe("issueTicketForType() — Ticket Engine v2 (2026-09-16)", () => {
  it("чужое событие — RegistrationForbiddenError", async () => {
    ticketTypeFindUnique.mockResolvedValue({ ...activeTicketType, event: { id: "event1", createdById: "someone-else" } });
    await expect(issueTicketForType("tt1", "dancer1", owner)).rejects.toBeInstanceOf(RegistrationForbiddenError);
    expect(txTicketCreate).not.toHaveBeenCalled();
  });

  it("TicketType не найден — RegistrationNotFoundError", async () => {
    ticketTypeFindUnique.mockResolvedValue(null);
    await expect(issueTicketForType("missing", "dancer1", owner)).rejects.toBeInstanceOf(RegistrationNotFoundError);
  });

  it("танцор не зарегистрирован — TicketValidationError('not_registered')", async () => {
    eventRegistrationFindUnique.mockResolvedValue(null);
    await expect(issueTicketForType("tt1", "dancer1", owner)).rejects.toMatchObject({ code: "not_registered" });
    expect(txTicketCreate).not.toHaveBeenCalled();
  });

  it("TicketType не ACTIVE — TicketValidationError('pass_not_on_sale')", async () => {
    txTicketTypeFindUniqueOrThrow.mockResolvedValue({ ...activeTicketType, status: "PAUSED" });
    await expect(issueTicketForType("tt1", "dancer1", owner)).rejects.toMatchObject({ code: "pass_not_on_sale" });
  });

  it("мест больше нет — TicketValidationError('sold_out')", async () => {
    txTicketTypeFindUniqueOrThrow.mockResolvedValue({ ...activeTicketType, quantity: 5, soldQuantity: 5 });
    await expect(issueTicketForType("tt1", "dancer1", owner)).rejects.toMatchObject({ code: "sold_out" });
    expect(txTicketCreate).not.toHaveBeenCalled();
  });

  it("повторная покупка (P2002) — DuplicateTicketError", async () => {
    txTicketCreate.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));
    await expect(issueTicketForType("tt1", "dancer1", owner)).rejects.toBeInstanceOf(DuplicateTicketError);
  });

  it("бесплатный TicketType (price=null) — выдаётся сразу оплаченным", async () => {
    txTicketTypeFindUniqueOrThrow.mockResolvedValue({ ...activeTicketType, price: null });
    await issueTicketForType("tt1", "dancer1", owner, { markPaid: false });
    expect(txTicketCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ isPaid: true, paidAt: expect.any(Date) }) });
  });

  it("платный TicketType, markPaid не передан — isPaid=false", async () => {
    await issueTicketForType("tt1", "dancer1", owner);
    expect(txTicketCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ isPaid: false, paidAt: null }) });
  });

  it("снимок цены/валюты + issuedById, без passId", async () => {
    await issueTicketForType("tt1", "dancer1", owner, { markPaid: true });
    expect(txTicketCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventId: "event1",
        ticketTypeId: "tt1",
        dancerId: "dancer1",
        price: 15,
        currency: "BYN",
        issuedById: "owner1",
      }),
    });
  });

  it("успешная выдача — инкрементирует TicketType.soldQuantity", async () => {
    await issueTicketForType("tt1", "dancer1", owner);
    expect(txTicketTypeUpdate).toHaveBeenCalledWith({ where: { id: "tt1" }, data: { soldQuantity: { increment: 1 } } });
  });

  it("после выдачи последнего места — переключается в SOLD_OUT", async () => {
    txTicketTypeFindUniqueOrThrow.mockResolvedValue({ ...activeTicketType, quantity: 5, soldQuantity: 4 });
    txTicketTypeUpdate.mockResolvedValueOnce({ ...activeTicketType, quantity: 5, soldQuantity: 5, status: "ACTIVE" });

    await issueTicketForType("tt1", "dancer1", owner);

    expect(txTicketTypeUpdate).toHaveBeenCalledWith({ where: { id: "tt1" }, data: { status: "SOLD_OUT" } });
  });
});

describe("cancelTicket() / refundTicket() — билет по TicketType", () => {
  it("cancelTicket — ISSUED с TicketType — освобождает место через ticketType, не через pass", async () => {
    ticketFindUnique.mockResolvedValue({ id: "ticket1", status: "ISSUED", passId: null, ticketTypeId: "tt1", event });
    txTicketUpdate.mockResolvedValue({ id: "ticket1", status: "CANCELLED" });

    await cancelTicket("ticket1", owner);

    expect(txTicketTypeUpdate).toHaveBeenCalledWith({ where: { id: "tt1" }, data: { soldQuantity: { decrement: 1 } } });
    expect(txPassUpdate).not.toHaveBeenCalled();
  });

  it("refundTicket — оплаченный ISSUED с TicketType — освобождает место через ticketType", async () => {
    ticketFindUnique.mockResolvedValue({ id: "ticket1", status: "ISSUED", isPaid: true, passId: null, ticketTypeId: "tt1", event });
    txTicketUpdate.mockResolvedValue({ id: "ticket1", status: "REFUNDED" });

    await refundTicket("ticket1", owner);

    expect(txTicketTypeUpdate).toHaveBeenCalledWith({ where: { id: "tt1" }, data: { soldQuantity: { decrement: 1 } } });
  });
});

describe("getEventPassRevenue() / getEventTicketTypeRevenue() — Commerce Engine v1 (2026-09-17)", () => {
  it("getEventTicketTypeRevenue — суммирует OrderItem.total оплаченных заказов с productType=EVENT_TICKET", async () => {
    orderItemFindMany.mockResolvedValue([
      { total: 15, order: { refunds: [] } },
      { total: 10, order: { refunds: [] } },
    ]);
    const result = await getEventTicketTypeRevenue("event1", owner);
    expect(result).toBe(25);
    expect(orderItemFindMany).toHaveBeenCalledWith({
      where: { product: { eventId: "event1", type: "EVENT_TICKET" }, order: { status: { in: ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"] } } },
      select: { total: true, order: { select: { refunds: { where: { status: "COMPLETED" }, select: { amount: true } } } } },
    });
  });

  it("getEventPassRevenue — тот же принцип, но productType=PASS", async () => {
    orderItemFindMany.mockResolvedValue([{ total: 120, order: { refunds: [] } }]);
    const result = await getEventPassRevenue("event1", owner);
    expect(result).toBe(120);
    expect(orderItemFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ product: { eventId: "event1", type: "PASS" } }) })
    );
  });

  it("вычитает суммы COMPLETED Refund — чистый (net) доход, не gross", async () => {
    orderItemFindMany.mockResolvedValue([{ total: 100, order: { refunds: [{ amount: 30 }] } }]);
    const result = await getEventPassRevenue("event1", owner);
    expect(result).toBe(70);
  });

  it("полностью возвращённый заказ — вклад в выручку 0, не отрицательное число", async () => {
    orderItemFindMany.mockResolvedValue([{ total: 100, order: { refunds: [{ amount: 100 }] } }]);
    const result = await getEventPassRevenue("event1", owner);
    expect(result).toBe(0);
  });

  it("чужое событие — RegistrationForbiddenError", async () => {
    eventFindUnique.mockResolvedValue({ id: "event1", createdById: "someone-else" });
    await expect(getEventTicketTypeRevenue("event1", owner)).rejects.toBeInstanceOf(RegistrationForbiddenError);
  });
});

describe("findFestivalPassForEvent() / issueFestivalPassEntry() — межсобытийный Pass фестиваля (этап 3)", () => {
  it("событие не является дочерним ни для одного фестиваля — null", async () => {
    programItemFindFirst.mockResolvedValue(null);
    const result = await findFestivalPassForEvent("child-event", "dancer1");
    expect(result).toBeNull();
  });

  it("дочернее событие фестиваля, но у танцора нет Pass фестиваля — null", async () => {
    programItemFindFirst.mockResolvedValue({ id: "item1", festival: { eventId: "festival1" } });
    ticketFindFirst.mockResolvedValue(null);
    const result = await findFestivalPassForEvent("child-event", "dancer1");
    expect(result).toBeNull();
  });

  it("у Pass пустые accessGrants — доступ ко всей программе фестиваля", async () => {
    programItemFindFirst.mockResolvedValue({ id: "item1", festival: { eventId: "festival1" } });
    ticketFindFirst.mockResolvedValue({ pass: { id: "pass1", name: "Full Pass", accessGrants: [] } });

    const result = await findFestivalPassForEvent("child-event", "dancer1");

    expect(result).toEqual({ passId: "pass1", passName: "Full Pass", festivalEventId: "festival1" });
  });

  it("у Pass есть accessGrants, но не на этот пункт программы — null", async () => {
    programItemFindFirst.mockResolvedValue({ id: "item1", festival: { eventId: "festival1" } });
    ticketFindFirst.mockResolvedValue({ pass: { id: "pass1", name: "Party Pass", accessGrants: [{ programItemId: "other-item" }] } });

    const result = await findFestivalPassForEvent("child-event", "dancer1");

    expect(result).toBeNull();
  });

  it("accessGrants включают именно этот пункт программы — доступ разрешён", async () => {
    programItemFindFirst.mockResolvedValue({ id: "item1", festival: { eventId: "festival1" } });
    ticketFindFirst.mockResolvedValue({ pass: { id: "pass1", name: "Party Pass", accessGrants: [{ programItemId: "item1" }] } });

    const result = await findFestivalPassForEvent("child-event", "dancer1");

    expect(result).toEqual({ passId: "pass1", passName: "Party Pass", festivalEventId: "festival1" });
  });

  it("issueFestivalPassEntry — нет действующего Pass — TicketValidationError('no_festival_pass')", async () => {
    programItemFindFirst.mockResolvedValue(null);
    await expect(issueFestivalPassEntry("child-event", "dancer1", owner)).rejects.toMatchObject({ code: "no_festival_pass" });
    expect(ticketCreate).not.toHaveBeenCalled();
  });

  it("issueFestivalPassEntry — уже материализован (идемпотентно) — возвращает существующий, не создаёт новый", async () => {
    programItemFindFirst.mockResolvedValue({ id: "item1", festival: { eventId: "festival1" } });
    ticketFindFirst.mockResolvedValue({ pass: { id: "pass1", name: "Full Pass", accessGrants: [] } });
    ticketFindUnique.mockResolvedValue({ id: "existing-derived", eventId: "child-event", passId: "pass1", dancerId: "dancer1" });

    const result = await issueFestivalPassEntry("child-event", "dancer1", owner);

    expect(result).toEqual({ id: "existing-derived", eventId: "child-event", passId: "pass1", dancerId: "dancer1" });
    expect(ticketCreate).not.toHaveBeenCalled();
  });

  it("issueFestivalPassEntry — создаёт производный Ticket с price=null, isPaid=true", async () => {
    programItemFindFirst.mockResolvedValue({ id: "item1", festival: { eventId: "festival1" } });
    ticketFindFirst.mockResolvedValue({ pass: { id: "pass1", name: "Full Pass", accessGrants: [] } });
    ticketFindUnique.mockResolvedValue(null);

    await issueFestivalPassEntry("child-event", "dancer1", owner);

    expect(ticketCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventId: "child-event",
        passId: "pass1",
        dancerId: "dancer1",
        price: null,
        currency: null,
        isPaid: true,
        issuedById: "owner1",
      }),
    });
  });

  it("issueFestivalPassEntry — чужое событие — RegistrationForbiddenError", async () => {
    eventFindUnique.mockResolvedValue({ id: "child-event", createdById: "someone-else" });
    await expect(issueFestivalPassEntry("child-event", "dancer1", owner)).rejects.toBeInstanceOf(RegistrationForbiddenError);
  });
});

describe("isProgramItemAccessibleByGrants() — вынесено из findFestivalPassForEvent (Stage 6 Festival Engine, 2026-09-17)", () => {
  it("пустой список грантов — доступ ко всему (Full Pass)", () => {
    expect(isProgramItemAccessibleByGrants([], "item1")).toBe(true);
  });

  it("гранты есть, но не на этот пункт — недоступно", () => {
    expect(isProgramItemAccessibleByGrants([{ programItemId: "other" }], "item1")).toBe(false);
  });

  it("гранты включают этот пункт — доступно", () => {
    expect(isProgramItemAccessibleByGrants([{ programItemId: "other" }, { programItemId: "item1" }], "item1")).toBe(true);
  });
});

describe("getEventPassAttendanceCount()", () => {
  it("считает только производные входы — Pass которых принадлежит ДРУГОМУ событию", async () => {
    ticketCount.mockResolvedValue(3);

    const result = await getEventPassAttendanceCount("event1", owner);

    expect(result).toBe(3);
    expect(ticketCount).toHaveBeenCalledWith({
      where: { eventId: "event1", passId: { not: null }, status: "ISSUED", pass: { eventId: { not: "event1" } } },
    });
  });

  it("чужое событие — RegistrationForbiddenError", async () => {
    eventFindUnique.mockResolvedValue({ id: "event1", createdById: "someone-else" });
    await expect(getEventPassAttendanceCount("event1", owner)).rejects.toBeInstanceOf(RegistrationForbiddenError);
  });
});

describe("Commerce Engine v1 (2026-09-17) — Order/OrderItem/Payment/Refund/UserPass рядом с Ticket", () => {
  it("issueTicket — создаёт Order(PENDING)+OrderItem+Payment(PENDING) и UserPass(ACTIVE), связывает Ticket.userPassId", async () => {
    await issueTicket("pass1", "dancer1", owner);

    expect(txProductFindUnique).toHaveBeenCalledWith({ where: { passId: "pass1" } });
    expect(txUserPassUpsert).toHaveBeenCalledWith({
      where: { dancerId_passId: { dancerId: "dancer1", passId: "pass1" } },
      update: {},
      create: { dancerId: "dancer1", passId: "pass1", status: "ACTIVE" },
    });
    expect(txOrderCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ eventId: "event1", dancerId: "dancer1", status: "PENDING", subtotal: 120, total: 120, createdById: "owner1" }),
    });
    expect(txOrderItemCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ orderId: "order1", productId: "product1", nameSnapshot: "Full Pass", unitPriceSnapshot: 120, quantity: 1 }),
    });
    expect(txPaymentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ orderId: "order1", provider: "MANUAL", amount: 120, status: "PENDING", recordedById: "owner1" }),
    });
    // orderItemId ещё не был проставлен у UserPass (orderItemId: null по умолчанию) — значит обновляем.
    expect(txUserPassUpdate).toHaveBeenCalledWith({ where: { id: "userpass1" }, data: { orderItemId: "orderitem1" } });
    expect(txTicketCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ userPassId: "userpass1" }) });
  });

  it("issueTicket, markPaid=true — Order/Payment сразу PAID", async () => {
    await issueTicket("pass1", "dancer1", owner, { markPaid: true });

    expect(txOrderCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ status: "PAID" }) });
    expect(txPaymentCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ status: "PAID", paidAt: expect.any(Date) }) });
  });

  it("issueTicket — UserPass уже привязан к другому OrderItem (повторный вызов) — orderItemId не перезаписывается", async () => {
    txUserPassUpsert.mockResolvedValue({ id: "userpass1", orderItemId: "existing-item" });

    await issueTicket("pass1", "dancer1", owner);

    expect(txUserPassUpdate).not.toHaveBeenCalled();
  });

  it("issueTicketForType — создаёт Order/OrderItem/Payment, связывает Ticket.orderItemId (без UserPass — TicketType не Pass)", async () => {
    await issueTicketForType("tt1", "dancer1", owner, { markPaid: true });

    expect(txProductFindUnique).toHaveBeenCalledWith({ where: { ticketTypeId: "tt1" } });
    expect(txUserPassUpsert).not.toHaveBeenCalled();
    expect(txOrderItemCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ productId: "product1", nameSnapshot: "Dancer", unitPriceSnapshot: 15 }),
    });
    expect(txTicketCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ orderItemId: "orderitem1" }) });
  });

  it("cancelTicket — Ticket без Commerce-связей (старые данные) — Order/UserPass не трогаются", async () => {
    ticketFindUnique.mockResolvedValue({ id: "ticket1", status: "ISSUED", passId: "pass1", event });
    txTicketUpdate.mockResolvedValue({ id: "ticket1", status: "CANCELLED" });

    await cancelTicket("ticket1", owner);

    expect(txOrderUpdate).not.toHaveBeenCalled();
    expect(txUserPassUpdate).not.toHaveBeenCalled();
  });

  it("cancelTicket — Ticket с userPassId — Order → CANCELLED, UserPass → REVOKED", async () => {
    ticketFindUnique.mockResolvedValue({ id: "ticket1", status: "ISSUED", passId: "pass1", userPassId: "userpass1", event });
    txTicketUpdate.mockResolvedValue({ id: "ticket1", status: "CANCELLED" });
    txUserPassFindUnique.mockResolvedValue({ orderItemId: "orderitem1" });
    txOrderItemFindUnique.mockResolvedValue({ orderId: "order1" });

    await cancelTicket("ticket1", owner);

    expect(txOrderUpdate).toHaveBeenCalledWith({ where: { id: "order1" }, data: { status: "CANCELLED" } });
    expect(txUserPassUpdate).toHaveBeenCalledWith({ where: { id: "userpass1" }, data: { status: "REVOKED" } });
  });

  it("refundTicket — Ticket с orderItemId (TicketType) — создаёт Refund, Order → REFUNDED", async () => {
    ticketFindUnique.mockResolvedValue({ id: "ticket1", status: "ISSUED", isPaid: true, passId: null, ticketTypeId: "tt1", orderItemId: "orderitem1", event });
    txTicketUpdate.mockResolvedValue({ id: "ticket1", status: "REFUNDED" });
    txOrderItemFindUnique.mockResolvedValue({ orderId: "order1" });

    await refundTicket("ticket1", owner);

    expect(txRefundCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ paymentId: "payment1", orderId: "order1", amount: 120, currency: "BYN", status: "COMPLETED", recordedById: "owner1" }),
    });
    expect(txOrderUpdate).toHaveBeenCalledWith({ where: { id: "order1" }, data: { status: "REFUNDED" } });
  });

  it("refundTicket — Ticket с userPassId — дополнительно отзывает UserPass (REVOKED)", async () => {
    ticketFindUnique.mockResolvedValue({ id: "ticket1", status: "ISSUED", isPaid: true, passId: "pass1", userPassId: "userpass1", event });
    txTicketUpdate.mockResolvedValue({ id: "ticket1", status: "REFUNDED" });
    txUserPassFindUnique.mockResolvedValue({ orderItemId: "orderitem1" });
    txOrderItemFindUnique.mockResolvedValue({ orderId: "order1" });

    await refundTicket("ticket1", owner);

    expect(txUserPassUpdate).toHaveBeenCalledWith({ where: { id: "userpass1" }, data: { status: "REVOKED" } });
  });

  it("refundTicket — производный вход (UserPass без orderItemId, нет своего Payment) — Refund не создаётся", async () => {
    ticketFindUnique.mockResolvedValue({ id: "ticket1", status: "ISSUED", isPaid: true, passId: "pass1", userPassId: "userpass1", event });
    txTicketUpdate.mockResolvedValue({ id: "ticket1", status: "REFUNDED" });
    txUserPassFindUnique.mockResolvedValue({ orderItemId: null });

    await refundTicket("ticket1", owner);

    expect(txRefundCreate).not.toHaveBeenCalled();
    expect(txOrderUpdate).not.toHaveBeenCalled();
    // Сам UserPass revoke тоже не должен произойти — findOrderIdForTicketInTx
    // не нашёл Order (нет прямой оплаты у этого производного входа).
    expect(txUserPassUpdate).not.toHaveBeenCalled();
  });

  it("issueFestivalPassEntry — связывает производный Ticket с существующим UserPass оригинальной покупки", async () => {
    programItemFindFirst.mockResolvedValue({ id: "item1", festival: { eventId: "festival1" } });
    ticketFindFirst.mockResolvedValue({ pass: { id: "pass1", name: "Full Pass", accessGrants: [] } });
    ticketFindUnique.mockResolvedValue(null);
    userPassFindUnique.mockResolvedValue({ id: "userpass1" });

    await issueFestivalPassEntry("child-event", "dancer1", owner);

    expect(userPassFindUnique).toHaveBeenCalledWith({ where: { dancerId_passId: { dancerId: "dancer1", passId: "pass1" } } });
    expect(ticketCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ userPassId: "userpass1" }) });
  });
});

describe("computePromoDiscount() — чистая функция", () => {
  it("FIXED_AMOUNT в пределах цены — вычитается как есть", () => {
    expect(computePromoDiscount(15, "FIXED_AMOUNT", 2)).toBe(2);
  });

  it("FIXED_AMOUNT больше цены — скидка не может превышать саму цену", () => {
    expect(computePromoDiscount(5, "FIXED_AMOUNT", 20)).toBe(5);
  });

  it("PERCENT — доля от цены", () => {
    expect(computePromoDiscount(100, "PERCENT", 20)).toBe(20);
  });

  it("бесплатный Pass (price=null) — скидывать нечего, 0", () => {
    expect(computePromoDiscount(null, "FIXED_AMOUNT", 2)).toBe(0);
  });

  it("price=0 — тоже 0, без отрицательных значений", () => {
    expect(computePromoDiscount(0, "PERCENT", 50)).toBe(0);
  });
});

describe("issueTicket() — применение скидки PromoCode (Commerce Engine v1, 2026-09-18)", () => {
  const activePromoCode = {
    id: "promo1",
    eventId: "event1",
    code: "DANCEFOREVER",
    discountType: "FIXED_AMOUNT" as const,
    discountValue: 2,
    validFrom: null as Date | null,
    validUntil: null as Date | null,
    maxUses: null as number | null,
    usedCount: 0,
    isActive: true,
    passes: [] as { passId: string }[],
  };

  it("действующий код без ограничений по Pass — цена уменьшается, Order/OrderItem/Payment/Ticket отражают скидку", async () => {
    txPromoCodeFindUnique.mockResolvedValue(activePromoCode);

    const ticket = await issueTicket("pass1", "dancer1", owner, { promoCode: "danceforever" });

    expect(txPromoCodeFindUnique).toHaveBeenCalledWith({
      where: { eventId_code: { eventId: "event1", code: "DANCEFOREVER" } },
      include: { passes: true },
    });
    // effective price 120 - discount 2 = 118.
    expect(txOrderCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ subtotal: 120, discount: 2, total: 118 }) });
    expect(txOrderItemCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ unitPriceSnapshot: 120, discountAmount: 2, total: 118 }),
    });
    expect(txPaymentCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ amount: 118 }) });
    expect(txTicketCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ price: 118, promoCodeId: "promo1", discountAmount: 2 }),
    });
    expect(txPromoCodeUpdate).toHaveBeenCalledWith({ where: { id: "promo1" }, data: { usedCount: { increment: 1 } } });
    expect(ticket).toBeDefined();
  });

  it("код не найден — TicketValidationError('invalid_promo_code'), билет не создаётся", async () => {
    txPromoCodeFindUnique.mockResolvedValue(null);
    await expect(issueTicket("pass1", "dancer1", owner, { promoCode: "MISSING" })).rejects.toMatchObject({ code: "invalid_promo_code" });
    expect(txTicketCreate).not.toHaveBeenCalled();
    expect(txPromoCodeUpdate).not.toHaveBeenCalled();
  });

  it("код неактивен (isActive=false) — invalid_promo_code", async () => {
    txPromoCodeFindUnique.mockResolvedValue({ ...activePromoCode, isActive: false });
    await expect(issueTicket("pass1", "dancer1", owner, { promoCode: "DANCEFOREVER" })).rejects.toMatchObject({ code: "invalid_promo_code" });
  });

  it("код ещё не начал действовать (validFrom в будущем) — invalid_promo_code", async () => {
    txPromoCodeFindUnique.mockResolvedValue({ ...activePromoCode, validFrom: new Date(Date.now() + 86_400_000) });
    await expect(issueTicket("pass1", "dancer1", owner, { promoCode: "DANCEFOREVER" })).rejects.toMatchObject({ code: "invalid_promo_code" });
  });

  it("код уже истёк (validUntil в прошлом) — invalid_promo_code", async () => {
    txPromoCodeFindUnique.mockResolvedValue({ ...activePromoCode, validUntil: new Date(Date.now() - 86_400_000) });
    await expect(issueTicket("pass1", "dancer1", owner, { promoCode: "DANCEFOREVER" })).rejects.toMatchObject({ code: "invalid_promo_code" });
  });

  it("лимит использований исчерпан (usedCount >= maxUses) — invalid_promo_code", async () => {
    txPromoCodeFindUnique.mockResolvedValue({ ...activePromoCode, maxUses: 5, usedCount: 5 });
    await expect(issueTicket("pass1", "dancer1", owner, { promoCode: "DANCEFOREVER" })).rejects.toMatchObject({ code: "invalid_promo_code" });
  });

  it("код привязан к ДРУГОМУ Pass (PromoCodePass не включает pass1) — invalid_promo_code", async () => {
    txPromoCodeFindUnique.mockResolvedValue({ ...activePromoCode, passes: [{ passId: "other-pass" }] });
    await expect(issueTicket("pass1", "dancer1", owner, { promoCode: "DANCEFOREVER" })).rejects.toMatchObject({ code: "invalid_promo_code" });
  });

  it("код привязан именно к этому Pass (passes включает pass1) — применяется", async () => {
    txPromoCodeFindUnique.mockResolvedValue({ ...activePromoCode, passes: [{ passId: "pass1" }] });
    await expect(issueTicket("pass1", "dancer1", owner, { promoCode: "DANCEFOREVER" })).resolves.toBeDefined();
    expect(txTicketCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ discountAmount: 2 }) });
  });

  it("скидка съедает всю цену (price=0 после скидки) — билет сразу оплачен, как бесплатный Pass", async () => {
    txPassFindUniqueOrThrow.mockResolvedValue({ ...activePass, price: 2 });
    txPromoCodeFindUnique.mockResolvedValue(activePromoCode);

    await issueTicket("pass1", "dancer1", owner, { promoCode: "DANCEFOREVER", markPaid: false });

    expect(txTicketCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ price: 0, isPaid: true, paidAt: expect.any(Date) }) });
  });

  it("код не передан — промокод вообще не запрашивается, старое поведение без изменений", async () => {
    await issueTicket("pass1", "dancer1", owner);
    expect(txPromoCodeFindUnique).not.toHaveBeenCalled();
    expect(txTicketCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ promoCodeId: null, discountAmount: null }) });
  });
});

describe("issueTicket()/issueTicketForType() — максимум один билет на событие (Commerce Engine v1, 2026-09-18)", () => {
  it("issueTicket — у танцора уже есть ISSUED TicketType-билет на это же событие — already_has_admission", async () => {
    txTicketFindFirst.mockResolvedValue({ id: "existing-tt-ticket" });
    await expect(issueTicket("pass1", "dancer1", owner)).rejects.toMatchObject({ code: "already_has_admission" });
    expect(txTicketCreate).not.toHaveBeenCalled();
  });

  it("issueTicket — у танцора уже есть ISSUED билет на ДРУГОЙ Pass этого же события — already_has_admission", async () => {
    txTicketFindFirst.mockResolvedValue({ id: "existing-other-pass-ticket" });
    await expect(issueTicket("pass1", "dancer1", owner)).rejects.toMatchObject({ code: "already_has_admission" });
  });

  it("issueTicket — проверка исключает ТЕКУЩИЙ покупаемый Pass (повторная покупка falls through к DuplicateTicketError, не блокируется этой проверкой)", async () => {
    txTicketFindFirst.mockResolvedValue(null); // мок уже исключает переданный passId/ticketTypeId (NOT {passId, ticketTypeId})
    txTicketCreate.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));
    await expect(issueTicket("pass1", "dancer1", owner)).rejects.toBeInstanceOf(DuplicateTicketError);
    expect(txTicketFindFirst).toHaveBeenCalledWith({
      where: { eventId: "event1", dancerId: "dancer1", status: "ISSUED", NOT: { passId: "pass1", ticketTypeId: null } },
      select: { id: true },
    });
  });

  it("issueTicket — два advisory lock'а: на Pass и на пару (event, dancer)", async () => {
    await issueTicket("pass1", "dancer1", owner);
    expect(executeRaw).toHaveBeenCalledTimes(2);
  });

  it("issueTicket — свободных билетов на это событие нет — проходит", async () => {
    txTicketFindFirst.mockResolvedValue(null);
    await expect(issueTicket("pass1", "dancer1", owner)).resolves.toBeDefined();
  });

  it("issueTicketForType — у танцора уже есть ISSUED Pass-билет на это же событие — already_has_admission", async () => {
    txTicketFindFirst.mockResolvedValue({ id: "existing-pass-ticket" });
    await expect(issueTicketForType("tt1", "dancer1", owner)).rejects.toMatchObject({ code: "already_has_admission" });
    expect(txTicketCreate).not.toHaveBeenCalled();
  });

  it("issueTicketForType — проверка исключает ТЕКУЩИЙ покупаемый TicketType", async () => {
    txTicketFindFirst.mockResolvedValue(null);
    await issueTicketForType("tt1", "dancer1", owner);
    expect(txTicketFindFirst).toHaveBeenCalledWith({
      where: { eventId: "event1", dancerId: "dancer1", status: "ISSUED", NOT: { passId: null, ticketTypeId: "tt1" } },
      select: { id: true },
    });
  });
});
