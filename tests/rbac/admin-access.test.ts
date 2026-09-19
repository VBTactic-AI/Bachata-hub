import { describe, expect, it, vi } from "vitest";
import type { User } from "@prisma/client";
import type { Actor } from "@/server/rbac/actor";

vi.mock("@/lib/prisma", () => ({
  prisma: { school: { findFirst: vi.fn().mockResolvedValue(null) } },
}));

const { getAdminSectionAccess } = await import("@/lib/admin-access");

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-1",
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

function makeActor(byCompetition: Record<string, string[]> = {}, global: string[] = []): Actor {
  return {
    userId: "user-1",
    email: "u@example.com",
    globalPermissions: new Set(global as never[]),
    permissionsByCompetition: new Map(Object.entries(byCompetition).map(([k, v]) => [k, new Set(v as never[])])),
  };
}

describe("getAdminSectionAccess() — раздел «Соревнования»", () => {
  it("рядовой зарегистрированный участник (роль COMPETITOR, без единого штатного назначения) — competitions: false (2026-09-14, реальный баг)", async () => {
    const actor = makeActor({ comp1: ["registration:create", "registration:update_own", "checkin:self"] });
    const access = await getAdminSectionAccess(makeUser(), actor);
    expect(access.competitions).toBe(false);
  });

  it("судья без других ролей — competitions: false", async () => {
    const actor = makeActor({ comp1: ["score:submit", "score:view_own"] });
    const access = await getAdminSectionAccess(makeUser(), actor);
    expect(access.competitions).toBe(false);
  });

  it("вообще без actor (гость/неавторизован) — competitions: false", async () => {
    const access = await getAdminSectionAccess(makeUser(), null);
    expect(access.competitions).toBe(false);
  });

  it("EVENT_ADMIN в конкретном соревновании — competitions: true", async () => {
    const actor = makeActor({ comp1: ["competition:update", "round:create"] });
    const access = await getAdminSectionAccess(makeUser(), actor);
    expect(access.competitions).toBe(true);
  });

  it("site-роль ADMIN (мост на SUPER_ADMIN) — competitions: true, даже без единого CompetitionMember", async () => {
    const access = await getAdminSectionAccess(makeUser({ role: "ADMIN" }), makeActor());
    expect(access.competitions).toBe(true);
  });

  it("глобальное competition:create — competitions: true", async () => {
    const actor = makeActor({}, ["competition:create"]);
    const access = await getAdminSectionAccess(makeUser(), actor);
    expect(access.competitions).toBe(true);
  });
});

// 2026-09-19, по прямому вопросу пользователя ("почему у супер админа нету
// доступа к админке фестиваля") — реальный баг: /admin/festival/layout.tsx
// уже давно пускает site-ADMIN (isAdmin(user) bypass), но getAdminSectionAccess()
// эту же ветку не учитывала — ADMIN без ОТДЕЛЬНОГО isVerifiedFestivalOrganizer
// технически проходил на саму страницу, но карточки "Фестивали" на хабе
// /admin и кнопки "Админ панель" на /profile не видел — доступ был, найти
// его было неоткуда.
describe("getAdminSectionAccess() — раздел «Фестивали»", () => {
  it("site-роль ADMIN — festival: true, даже без isVerifiedFestivalOrganizer", async () => {
    const access = await getAdminSectionAccess(makeUser({ role: "ADMIN", isVerifiedFestivalOrganizer: false }), null);
    expect(access.festival).toBe(true);
  });

  it("isVerifiedFestivalOrganizer без роли ADMIN — festival: true", async () => {
    const access = await getAdminSectionAccess(makeUser({ isVerifiedFestivalOrganizer: true }), null);
    expect(access.festival).toBe(true);
  });

  it("ни ADMIN, ни isVerifiedFestivalOrganizer — festival: false", async () => {
    const access = await getAdminSectionAccess(makeUser(), null);
    expect(access.festival).toBe(false);
  });
});
