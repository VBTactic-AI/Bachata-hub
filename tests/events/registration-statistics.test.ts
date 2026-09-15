import { describe, it, expect, vi, beforeEach } from "vitest";
import type { User } from "@prisma/client";

// §19 ТЗ (Event Statistics) — getEventRegistrationStatistics(). Мокается
// только @/lib/prisma (тот же приём, что и registration-export.test.ts),
// hasEventAccess() выполняется по-настоящему.

const eventFindUnique = vi.fn();
const eventRegistrationGroupBy = vi.fn();
const eventRegistrationCount = vi.fn();
const eventRegistrationFindMany = vi.fn();
const eventTeamMemberFindUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    event: { findUnique: (...a: unknown[]) => eventFindUnique(...a) },
    eventRegistration: {
      groupBy: (...a: unknown[]) => eventRegistrationGroupBy(...a),
      count: (...a: unknown[]) => eventRegistrationCount(...a),
      findMany: (...a: unknown[]) => eventRegistrationFindMany(...a),
    },
    eventTeamMember: { findUnique: (...a: unknown[]) => eventTeamMemberFindUnique(...a) },
  },
}));

const { getEventRegistrationStatistics } = await import("@/server/events/registration-statistics");
const { RegistrationForbiddenError, RegistrationNotFoundError } = await import("@/server/events/registration-service");

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "user1",
    email: "u@example.com",
    passwordHash: null,
    supabaseUserId: null,
    role: "DANCER",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastLoginAt: null,
    isBlocked: false,
    isVerifiedEventOrganizer: false,
    isVerifiedFestivalOrganizer: false,
    ...overrides,
  };
}

const registrableEvent = { id: "event1", createdById: "user1" };
const user = makeUser();

beforeEach(() => {
  eventFindUnique.mockReset().mockResolvedValue(registrableEvent);
  eventRegistrationGroupBy.mockReset().mockResolvedValue([]);
  eventRegistrationCount.mockReset().mockResolvedValue(0);
  eventRegistrationFindMany.mockReset().mockResolvedValue([]);
  eventTeamMemberFindUnique.mockReset().mockResolvedValue(null);
});

describe("getEventRegistrationStatistics() — RBAC", () => {
  it("чужое событие, не ADMIN — RegistrationForbiddenError", async () => {
    eventFindUnique.mockResolvedValue({ id: "event1", createdById: "someone-else" });
    await expect(getEventRegistrationStatistics("event1", user)).rejects.toBeInstanceOf(RegistrationForbiddenError);
    expect(eventRegistrationGroupBy).not.toHaveBeenCalled();
  });

  it("событие не найдено — RegistrationNotFoundError", async () => {
    eventFindUnique.mockResolvedValue(null);
    await expect(getEventRegistrationStatistics("missing", user)).rejects.toBeInstanceOf(RegistrationNotFoundError);
  });
});

describe("getEventRegistrationStatistics() — подсчёты", () => {
  it("никто не зарегистрирован — все счётчики нулевые, noShowRate=null", async () => {
    const stats = await getEventRegistrationStatistics("event1", user);

    expect(stats.totalOverall).toBe(0);
    expect(stats.paidCount).toBe(0);
    expect(stats.noShowRate).toBeNull();
    expect(stats.registrationsByDay).toEqual([]);
    expect(stats.byStatus).toEqual({
      REGISTERED: 0,
      CONFIRMED: 0,
      WAITLIST: 0,
      CANCELLED: 0,
      REJECTED: 0,
      NO_SHOW: 0,
    });
  });

  it("byStatus/totalOverall/paidCount считаются из groupBy/count", async () => {
    eventRegistrationGroupBy.mockResolvedValue([
      { status: "REGISTERED", _count: { _all: 3 } },
      { status: "WAITLIST", _count: { _all: 2 } },
      { status: "NO_SHOW", _count: { _all: 1 } },
    ]);
    eventRegistrationCount.mockResolvedValue(4);

    const stats = await getEventRegistrationStatistics("event1", user);

    expect(stats.totalOverall).toBe(6);
    expect(stats.byStatus.REGISTERED).toBe(3);
    expect(stats.byStatus.WAITLIST).toBe(2);
    expect(stats.byStatus.NO_SHOW).toBe(1);
    expect(stats.byStatus.CONFIRMED).toBe(0);
    expect(stats.paidCount).toBe(4);
  });

  // §19 — ключевое бизнес-правило: знаменатель неявки — только те, у кого
  // РЕАЛЬНО было место (REGISTERED/CONFIRMED/NO_SHOW), не WAITLIST/REJECTED/
  // CANCELLED (у них никогда не было шанса прийти).
  it("noShowRate считается только среди REGISTERED+CONFIRMED+NO_SHOW, игнорируя WAITLIST/REJECTED/CANCELLED", async () => {
    eventRegistrationGroupBy.mockResolvedValue([
      { status: "REGISTERED", _count: { _all: 2 } },
      { status: "CONFIRMED", _count: { _all: 1 } },
      { status: "NO_SHOW", _count: { _all: 1 } },
      { status: "WAITLIST", _count: { _all: 10 } },
      { status: "REJECTED", _count: { _all: 10 } },
      { status: "CANCELLED", _count: { _all: 10 } },
    ]);

    const stats = await getEventRegistrationStatistics("event1", user);

    // 1 NO_SHOW из (2 REGISTERED + 1 CONFIRMED + 1 NO_SHOW) = 1/4 = 0.25
    expect(stats.noShowRate).toBe(0.25);
  });

  it("группирует регистрации по дню createdAt, сортирует по возрастанию даты", async () => {
    eventRegistrationFindMany.mockResolvedValue([
      { createdAt: new Date("2026-09-15T10:00:00Z") },
      { createdAt: new Date("2026-09-15T18:00:00Z") },
      { createdAt: new Date("2026-09-14T09:00:00Z") },
    ]);

    const stats = await getEventRegistrationStatistics("event1", user);

    expect(stats.registrationsByDay).toEqual([
      { date: "2026-09-14", count: 1 },
      { date: "2026-09-15", count: 2 },
    ]);
  });
});
