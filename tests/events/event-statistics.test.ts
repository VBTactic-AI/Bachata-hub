import { describe, it, expect, vi, beforeEach } from "vitest";
import type { User } from "@prisma/client";

// "Распределение по билетам" (2026-09-18, вкладка "Статистика") —
// getTicketDistributionForEvent(). Тот же приём мокирования, что и в
// registration-statistics.test.ts — мокается только @/lib/prisma,
// hasEventAccess() выполняется по-настоящему.

const eventFindUnique = vi.fn();
const eventTeamMemberFindUnique = vi.fn();
const ticketFindMany = vi.fn();
const doorSaleFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    event: { findUnique: (...a: unknown[]) => eventFindUnique(...a) },
    eventTeamMember: { findUnique: (...a: unknown[]) => eventTeamMemberFindUnique(...a) },
    ticket: { findMany: (...a: unknown[]) => ticketFindMany(...a) },
    doorSale: { findMany: (...a: unknown[]) => doorSaleFindMany(...a) },
  },
}));

const { getTicketDistributionForEvent } = await import("@/server/events/event-statistics");
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

const event = { id: "event1", createdById: "user1" };
const user = makeUser();

beforeEach(() => {
  eventFindUnique.mockReset().mockResolvedValue(event);
  eventTeamMemberFindUnique.mockReset().mockResolvedValue(null);
  ticketFindMany.mockReset().mockResolvedValue([]);
  doorSaleFindMany.mockReset().mockResolvedValue([]);
});

describe("getTicketDistributionForEvent() — RBAC", () => {
  it("чужое событие, не член команды — RegistrationForbiddenError", async () => {
    eventFindUnique.mockResolvedValue({ id: "event1", createdById: "someone-else" });
    await expect(getTicketDistributionForEvent("event1", user)).rejects.toBeInstanceOf(RegistrationForbiddenError);
    expect(ticketFindMany).not.toHaveBeenCalled();
  });

  it("событие не найдено — RegistrationNotFoundError", async () => {
    eventFindUnique.mockResolvedValue(null);
    await expect(getTicketDistributionForEvent("missing", user)).rejects.toBeInstanceOf(RegistrationNotFoundError);
  });
});

describe("getTicketDistributionForEvent() — группировка", () => {
  it("пусто — пустой массив", async () => {
    expect(await getTicketDistributionForEvent("event1", user)).toEqual([]);
  });

  it("группирует ISSUED Ticket по названию Pass/TicketType, сортирует по убыванию", async () => {
    ticketFindMany.mockResolvedValue([
      { pass: { name: "Танцор" }, ticketType: null },
      { pass: { name: "Танцор" }, ticketType: null },
      { pass: null, ticketType: { name: "Преподаватель" } },
      { pass: null, ticketType: null }, // passless — "Входной билет"
    ]);

    const dist = await getTicketDistributionForEvent("event1", user);

    expect(dist).toEqual([
      { name: "Танцор", count: 2 },
      { name: "Преподаватель", count: 1 },
      { name: "Входной билет", count: 1 },
    ]);
  });

  it("учитывает DoorSale ('продажа на входе') в той же группировке по названию", async () => {
    ticketFindMany.mockResolvedValue([{ pass: { name: "Танцор" }, ticketType: null }]);
    doorSaleFindMany.mockResolvedValue([{ nameSnapshot: "Танцор" }, { nameSnapshot: "Преподаватель" }]);

    const dist = await getTicketDistributionForEvent("event1", user);

    expect(dist).toEqual([
      { name: "Танцор", count: 2 },
      { name: "Преподаватель", count: 1 },
    ]);
  });
});
