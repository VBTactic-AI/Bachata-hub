import { describe, it, expect, vi, beforeEach } from "vitest";
import type { User } from "@prisma/client";

const festivalFindUnique = vi.fn();
const sponsorAggregate = vi.fn();
const expenseAggregate = vi.fn();
const eventTeamMemberFindUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    festival: { findUnique: (...a: unknown[]) => festivalFindUnique(...a) },
    festivalSponsor: { aggregate: (...a: unknown[]) => sponsorAggregate(...a) },
    festivalExpense: { aggregate: (...a: unknown[]) => expenseAggregate(...a) },
    eventTeamMember: { findUnique: (...a: unknown[]) => eventTeamMemberFindUnique(...a) },
  },
}));

// getEventPassRevenue — уже протестирована в ticket-service.test.ts, здесь
// мокаем целиком: бюджет фестиваля просто вызывает её на bridge-Event, не
// дублирует расчёт выручки по Ticket.
const getEventPassRevenueMock = vi.fn();
vi.mock("@/server/events/ticket-service", () => ({
  getEventPassRevenue: (...a: unknown[]) => getEventPassRevenueMock(...a),
}));

const { getFestivalBudgetSummary } = await import("@/server/events/festival-budget-service");
const { RegistrationForbiddenError } = await import("@/server/events/registration-service");

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "user1",
    email: "user1@example.com",
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
  } as User;
}

const owner = makeUser({ id: "owner1" });
const stranger = makeUser({ id: "stranger1" });

beforeEach(() => {
  vi.clearAllMocks();
  eventTeamMemberFindUnique.mockResolvedValue(null);
  sponsorAggregate.mockResolvedValue({ _sum: { amount: null } });
  expenseAggregate.mockResolvedValue({ _sum: { amount: null } });
});

describe("getFestivalBudgetSummary()", () => {
  it("постороннему запрещено", async () => {
    festivalFindUnique.mockResolvedValue({ id: "fest1", createdById: "owner1", eventId: null });
    await expect(getFestivalBudgetSummary("fest1", stranger)).rejects.toBeInstanceOf(RegistrationForbiddenError);
  });

  it("нет bridge-Event — доход по Pass = 0, getEventPassRevenue не вызывается", async () => {
    festivalFindUnique.mockResolvedValue({ id: "fest1", createdById: "owner1", eventId: null });

    const summary = await getFestivalBudgetSummary("fest1", owner);

    expect(getEventPassRevenueMock).not.toHaveBeenCalled();
    expect(summary.passRevenue).toBe(0);
    expect(summary.totalIncome).toBe(0);
    expect(summary.balance).toBe(0);
  });

  it("складывает выручку по Pass, взносы спонсоров, вычитает расходы", async () => {
    festivalFindUnique.mockResolvedValue({ id: "fest1", createdById: "owner1", eventId: "event1" });
    getEventPassRevenueMock.mockResolvedValue(21460);
    sponsorAggregate.mockResolvedValue({ _sum: { amount: 1800 } });
    expenseAggregate.mockResolvedValue({ _sum: { amount: 9750 } });

    const summary = await getFestivalBudgetSummary("fest1", owner);

    expect(getEventPassRevenueMock).toHaveBeenCalledWith("event1", owner);
    expect(summary).toEqual({
      passRevenue: 21460,
      sponsorIncome: 1800,
      totalIncome: 23260,
      totalExpenses: 9750,
      balance: 13510,
    });
  });

  it("без спонсоров/расходов агрегаты null → трактуются как 0", async () => {
    festivalFindUnique.mockResolvedValue({ id: "fest1", createdById: "owner1", eventId: "event1" });
    getEventPassRevenueMock.mockResolvedValue(500);

    const summary = await getFestivalBudgetSummary("fest1", owner);

    expect(summary.sponsorIncome).toBe(0);
    expect(summary.totalExpenses).toBe(0);
    expect(summary.balance).toBe(500);
  });
});
