import { describe, it, expect, vi, beforeEach } from "vitest";
import type { User } from "@prisma/client";

// TicketCheckIn (Commerce Engine v1, 2026-09-17) — явка по конкретному
// билету. Доступ — hasEventAccess (любой член команды события), тот же
// принцип, что и у остального управления билетами в ticket-service.ts.

const eventFindUnique = vi.fn();
const ticketFindUnique = vi.fn(); // requireAccessForTicket (ticket-service.ts)
const ticketCheckInCreate = vi.fn();
const ticketCheckInFindUniqueOrThrow = vi.fn();
const ticketCheckInFindUnique = vi.fn();
const ticketCheckInDeleteMany = vi.fn();
const ticketCheckInFindMany = vi.fn();
const eventTeamMemberFindUnique = vi.fn(); // hasEventAccess

vi.mock("@/lib/prisma", () => ({
  prisma: {
    event: { findUnique: (...a: unknown[]) => eventFindUnique(...a) },
    ticket: { findUnique: (...a: unknown[]) => ticketFindUnique(...a) },
    ticketCheckIn: {
      create: (...a: unknown[]) => ticketCheckInCreate(...a),
      findUniqueOrThrow: (...a: unknown[]) => ticketCheckInFindUniqueOrThrow(...a),
      findUnique: (...a: unknown[]) => ticketCheckInFindUnique(...a),
      deleteMany: (...a: unknown[]) => ticketCheckInDeleteMany(...a),
      findMany: (...a: unknown[]) => ticketCheckInFindMany(...a),
    },
    eventTeamMember: { findUnique: (...a: unknown[]) => eventTeamMemberFindUnique(...a) },
  },
}));

const { checkInTicket, cancelTicketCheckIn, getTicketCheckIn, listCheckInsForEvent } = await import(
  "@/server/events/ticket-checkin-service"
);
const { TicketValidationError } = await import("@/server/events/ticket-service");
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
const issuedTicket = { id: "ticket1", status: "ISSUED", eventId: "event1", event };

beforeEach(() => {
  eventFindUnique.mockReset().mockResolvedValue(event);
  ticketFindUnique.mockReset().mockResolvedValue(issuedTicket);
  ticketCheckInCreate.mockReset().mockImplementation((args) => Promise.resolve({ id: "checkin1", ...args.data, checkedInAt: new Date() }));
  ticketCheckInFindUniqueOrThrow.mockReset();
  ticketCheckInFindUnique.mockReset().mockResolvedValue(null);
  ticketCheckInDeleteMany.mockReset().mockResolvedValue({ count: 1 });
  ticketCheckInFindMany.mockReset().mockResolvedValue([]);
  eventTeamMemberFindUnique.mockReset().mockResolvedValue(null);
});

describe("checkInTicket()", () => {
  it("чужое событие — RegistrationForbiddenError", async () => {
    ticketFindUnique.mockResolvedValue({ ...issuedTicket, event: { id: "event1", createdById: "someone-else" } });
    await expect(checkInTicket("ticket1", owner)).rejects.toBeInstanceOf(RegistrationForbiddenError);
    expect(ticketCheckInCreate).not.toHaveBeenCalled();
  });

  it("билет не найден — RegistrationNotFoundError", async () => {
    ticketFindUnique.mockResolvedValue(null);
    await expect(checkInTicket("missing", owner)).rejects.toBeInstanceOf(RegistrationNotFoundError);
  });

  it("билет REFUNDED — TicketValidationError('ticket_not_checkinable'), вход невозможен", async () => {
    ticketFindUnique.mockResolvedValue({ ...issuedTicket, status: "REFUNDED" });
    await expect(checkInTicket("ticket1", owner)).rejects.toMatchObject({ code: "ticket_not_checkinable" });
    expect(ticketCheckInCreate).not.toHaveBeenCalled();
  });

  it("билет CANCELLED — TicketValidationError('ticket_not_checkinable')", async () => {
    ticketFindUnique.mockResolvedValue({ ...issuedTicket, status: "CANCELLED" });
    await expect(checkInTicket("ticket1", owner)).rejects.toMatchObject({ code: "ticket_not_checkinable" });
  });

  it("билет ISSUED — создаёт TicketCheckIn с method=MANUAL по умолчанию", async () => {
    await checkInTicket("ticket1", owner);
    expect(ticketCheckInCreate).toHaveBeenCalledWith({ data: { ticketId: "ticket1", checkedInById: "owner1", method: "MANUAL" } });
  });

  it("method=QR явно передан — сохраняется как есть", async () => {
    await checkInTicket("ticket1", owner, "QR");
    expect(ticketCheckInCreate).toHaveBeenCalledWith({ data: { ticketId: "ticket1", checkedInById: "owner1", method: "QR" } });
  });

  it("повторный check-in (P2002 — уже есть строка) — идемпотентно возвращает существующую, не бросает ошибку", async () => {
    ticketCheckInCreate.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));
    ticketCheckInFindUniqueOrThrow.mockResolvedValue({ id: "checkin1", ticketId: "ticket1", method: "QR" });

    const result = await checkInTicket("ticket1", owner, "QR");

    expect(result).toEqual({ id: "checkin1", ticketId: "ticket1", method: "QR" });
    expect(ticketCheckInFindUniqueOrThrow).toHaveBeenCalledWith({ where: { ticketId: "ticket1" } });
  });

  it("не P2002 ошибка — пробрасывается как есть", async () => {
    ticketCheckInCreate.mockRejectedValue(new Error("db down"));
    await expect(checkInTicket("ticket1", owner)).rejects.toThrow("db down");
  });
});

describe("cancelTicketCheckIn()", () => {
  it("чужое событие — RegistrationForbiddenError", async () => {
    ticketFindUnique.mockResolvedValue({ ...issuedTicket, event: { id: "event1", createdById: "someone-else" } });
    await expect(cancelTicketCheckIn("ticket1", owner)).rejects.toBeInstanceOf(RegistrationForbiddenError);
  });

  it("удаляет строку явки (идемпотентно, если её и не было)", async () => {
    await cancelTicketCheckIn("ticket1", owner);
    expect(ticketCheckInDeleteMany).toHaveBeenCalledWith({ where: { ticketId: "ticket1" } });
  });
});

describe("getTicketCheckIn()", () => {
  it("чужое событие — RegistrationForbiddenError", async () => {
    ticketFindUnique.mockResolvedValue({ ...issuedTicket, event: { id: "event1", createdById: "someone-else" } });
    await expect(getTicketCheckIn("ticket1", owner)).rejects.toBeInstanceOf(RegistrationForbiddenError);
  });

  it("возвращает null, если явки не было", async () => {
    const result = await getTicketCheckIn("ticket1", owner);
    expect(result).toBeNull();
  });

  it("возвращает существующую отметку", async () => {
    ticketCheckInFindUnique.mockResolvedValue({ id: "checkin1", ticketId: "ticket1" });
    const result = await getTicketCheckIn("ticket1", owner);
    expect(result).toEqual({ id: "checkin1", ticketId: "ticket1" });
  });
});

describe("listCheckInsForEvent()", () => {
  it("чужое событие — RegistrationForbiddenError", async () => {
    eventFindUnique.mockResolvedValue({ id: "event1", createdById: "someone-else" });
    await expect(listCheckInsForEvent("event1", owner)).rejects.toBeInstanceOf(RegistrationForbiddenError);
  });

  it("событие не найдено — RegistrationNotFoundError", async () => {
    eventFindUnique.mockResolvedValue(null);
    await expect(listCheckInsForEvent("missing", owner)).rejects.toBeInstanceOf(RegistrationNotFoundError);
  });

  it("возвращает явки события, отсортированные по времени (новые сверху)", async () => {
    ticketCheckInFindMany.mockResolvedValue([{ id: "checkin1", ticketId: "ticket1" }]);
    const result = await listCheckInsForEvent("event1", owner);
    expect(result).toEqual([{ id: "checkin1", ticketId: "ticket1" }]);
    expect(ticketCheckInFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ticket: { eventId: "event1" } }, orderBy: { checkedInAt: "desc" } })
    );
  });
});
