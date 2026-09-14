import { describe, it, expect, vi, beforeEach } from "vitest";
import type { User } from "@prisma/client";

// Events Engine, этап 5 — EventTeamMember. НЕ путать с CompetitionMember
// (Слой 3) — другой домен.

const eventFindUnique = vi.fn();
const userFindUnique = vi.fn();
const eventTeamMemberFindUnique = vi.fn();
const eventTeamMemberFindMany = vi.fn();
const eventTeamMemberUpsert = vi.fn();
const eventTeamMemberDeleteMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    event: { findUnique: (...a: unknown[]) => eventFindUnique(...a) },
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    eventTeamMember: {
      findUnique: (...a: unknown[]) => eventTeamMemberFindUnique(...a),
      findMany: (...a: unknown[]) => eventTeamMemberFindMany(...a),
      upsert: (...a: unknown[]) => eventTeamMemberUpsert(...a),
      deleteMany: (...a: unknown[]) => eventTeamMemberDeleteMany(...a),
    },
  },
}));

const {
  addTeamMember,
  removeTeamMember,
  listTeamMembers,
  EventTeamValidationError,
} = await import("@/server/events/team-service");
const { RegistrationForbiddenError, RegistrationNotFoundError } = await import("@/server/events/registration-service");
const { hasEventAccess } = await import("@/server/events/access");

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

beforeEach(() => {
  eventFindUnique.mockReset().mockResolvedValue(event);
  userFindUnique.mockReset();
  eventTeamMemberFindUnique.mockReset().mockResolvedValue(null);
  eventTeamMemberFindMany.mockReset().mockResolvedValue([]);
  eventTeamMemberUpsert.mockReset().mockResolvedValue({ id: "member1" });
  eventTeamMemberDeleteMany.mockReset();
});

describe("addTeamMember() — owner-check", () => {
  it("не владелец, не ADMIN — RegistrationForbiddenError", async () => {
    const stranger = makeUser({ id: "someone-else" });
    await expect(addTeamMember("event1", stranger, "new@example.com", "MANAGER")).rejects.toBeInstanceOf(RegistrationForbiddenError);
  });

  it("ADMIN может добавить в чужое событие", async () => {
    const admin = makeUser({ id: "admin1", role: "ADMIN" });
    userFindUnique.mockResolvedValue({ id: "target1", email: "new@example.com" });
    await expect(addTeamMember("event1", admin, "new@example.com", "MANAGER")).resolves.toBeDefined();
  });

  it("email не найден — EventTeamValidationError", async () => {
    userFindUnique.mockResolvedValue(null);
    await expect(addTeamMember("event1", owner, "nobody@example.com", "MANAGER")).rejects.toBeInstanceOf(EventTeamValidationError);
    expect(eventTeamMemberUpsert).not.toHaveBeenCalled();
  });

  it("нельзя добавить самого владельца в команду", async () => {
    userFindUnique.mockResolvedValue({ id: "owner1", email: "owner@example.com" });
    await expect(addTeamMember("event1", owner, "owner@example.com", "MANAGER")).rejects.toBeInstanceOf(EventTeamValidationError);
  });

  it("успешно добавляет по email, роль сохраняется", async () => {
    userFindUnique.mockResolvedValue({ id: "target1", email: "new@example.com" });

    await addTeamMember("event1", owner, "New@Example.com", "FINANCE");

    expect(userFindUnique).toHaveBeenCalledWith({ where: { email: "new@example.com" } });
    expect(eventTeamMemberUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { eventId: "event1", userId: "target1", role: "FINANCE", invitedById: "owner1" },
      })
    );
  });
});

describe("removeTeamMember() — owner-check", () => {
  it("не владелец, не ADMIN — RegistrationForbiddenError", async () => {
    const stranger = makeUser({ id: "someone-else" });
    await expect(removeTeamMember("event1", stranger, "target1")).rejects.toBeInstanceOf(RegistrationForbiddenError);
    expect(eventTeamMemberDeleteMany).not.toHaveBeenCalled();
  });

  it("владелец удаляет участника команды", async () => {
    await removeTeamMember("event1", owner, "target1");
    expect(eventTeamMemberDeleteMany).toHaveBeenCalledWith({ where: { eventId: "event1", userId: "target1" } });
  });

  it("событие не найдено — RegistrationNotFoundError", async () => {
    eventFindUnique.mockResolvedValue(null);
    await expect(removeTeamMember("missing", owner, "target1")).rejects.toBeInstanceOf(RegistrationNotFoundError);
  });
});

describe("listTeamMembers() — owner-check", () => {
  it("не владелец, не ADMIN — RegistrationForbiddenError", async () => {
    const stranger = makeUser({ id: "someone-else" });
    await expect(listTeamMembers("event1", stranger)).rejects.toBeInstanceOf(RegistrationForbiddenError);
  });

  it("владелец видит список", async () => {
    eventTeamMemberFindMany.mockResolvedValue([{ id: "member1" }]);
    await expect(listTeamMembers("event1", owner)).resolves.toEqual([{ id: "member1" }]);
  });
});

describe("hasEventAccess() — используется registration-service.ts", () => {
  it("владелец — доступ есть без строки в EventTeamMember", async () => {
    await expect(hasEventAccess(event, owner)).resolves.toBe(true);
    expect(eventTeamMemberFindUnique).not.toHaveBeenCalled();
  });

  it("ADMIN — доступ есть к чужому событию", async () => {
    const admin = makeUser({ id: "admin1", role: "ADMIN" });
    await expect(hasEventAccess(event, admin)).resolves.toBe(true);
  });

  it("посторонний без членства в команде — доступа нет", async () => {
    const stranger = makeUser({ id: "someone-else" });
    eventTeamMemberFindUnique.mockResolvedValue(null);
    await expect(hasEventAccess(event, stranger)).resolves.toBe(false);
  });

  it("член команды (любая роль) — доступ есть", async () => {
    const teamMember = makeUser({ id: "member1" });
    eventTeamMemberFindUnique.mockResolvedValue({ id: "m1", role: "CHECK_IN" });
    await expect(hasEventAccess(event, teamMember)).resolves.toBe(true);
  });
});
