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

const executeRaw = vi.fn().mockResolvedValue(0);
const txPassFindUniqueOrThrow = vi.fn();
const txPassUpdate = vi.fn();
const txTicketTypeFindUniqueOrThrow = vi.fn();
const txTicketTypeUpdate = vi.fn();
const txTicketCreate = vi.fn();
const txTicketUpdate = vi.fn();
const txTicketFindFirst = vi.fn();
const txPassPriceTierFindMany = vi.fn();

const fakeTx = {
  $executeRaw: executeRaw,
  pass: { findUniqueOrThrow: txPassFindUniqueOrThrow, update: txPassUpdate },
  ticketType: { findUniqueOrThrow: txTicketTypeFindUniqueOrThrow, update: txTicketTypeUpdate },
  ticket: { create: txTicketCreate, update: txTicketUpdate, findFirst: txTicketFindFirst },
  passPriceTier: { findMany: txPassPriceTierFindMany },
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
  findFestivalPassForEvent,
  issueFestivalPassEntry,
  getEventPassAttendanceCount,
  TicketValidationError,
  DuplicateTicketError,
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
      { id: "t1", passId: "p1", passName: "Full Pass", ticketTypeId: null, ticketTypeName: null, isPaid: true },
      { id: "t2", passId: "p2", passName: "VIP Pass", ticketTypeId: null, ticketTypeName: null, isPaid: false },
    ]);
    expect(result.get("d2")).toEqual([
      { id: "t3", passId: null, passName: null, ticketTypeId: null, ticketTypeName: null, isPaid: true },
    ]);
  });

  it("группирует билеты с TicketType наравне с Pass", async () => {
    ticketFindMany.mockResolvedValue([
      { id: "t1", dancerId: "d1", passId: null, ticketTypeId: "tt1", isPaid: true, pass: null, ticketType: { name: "Dancer" } },
    ]);

    const result = await listTicketsByDancerForEvent("event1", ["d1"]);

    expect(result.get("d1")).toEqual([
      { id: "t1", passId: null, passName: null, ticketTypeId: "tt1", ticketTypeName: "Dancer", isPaid: true },
    ]);
  });

  it("summarizePayment: нет билетов — UNPAID", () => {
    expect(summarizePayment(undefined)).toBe("UNPAID");
    expect(summarizePayment([])).toBe("UNPAID");
  });

  it("summarizePayment: все оплачены — PAID", () => {
    expect(summarizePayment([{ id: "1", passId: null, passName: null, ticketTypeId: null, ticketTypeName: null, isPaid: true }])).toBe("PAID");
  });

  it("summarizePayment: часть оплачена — PARTIAL", () => {
    expect(
      summarizePayment([
        { id: "1", passId: null, passName: null, ticketTypeId: null, ticketTypeName: null, isPaid: true },
        { id: "2", passId: null, passName: null, ticketTypeId: null, ticketTypeName: null, isPaid: false },
      ])
    ).toBe("PARTIAL");
  });

  it("summarizePayment: ничего не оплачено — UNPAID", () => {
    expect(summarizePayment([{ id: "1", passId: null, passName: null, ticketTypeId: null, ticketTypeName: null, isPaid: false }])).toBe("UNPAID");
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

    expect(result).toEqual([{ id: "t1", passId: "p1", passName: "Full Pass", ticketTypeId: null, ticketTypeName: null, isPaid: true }]);
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

describe("getEventTicketTypeRevenue()", () => {
  it("суммирует price только оплаченных ISSUED билетов с ticketTypeId", async () => {
    ticketFindMany.mockResolvedValue([{ price: "15" }, { price: "10" }]);
    const result = await getEventTicketTypeRevenue("event1", owner);
    expect(result).toBe(25);
    expect(ticketFindMany).toHaveBeenCalledWith({
      where: { eventId: "event1", ticketTypeId: { not: null }, isPaid: true, status: "ISSUED" },
      select: { price: true },
    });
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
