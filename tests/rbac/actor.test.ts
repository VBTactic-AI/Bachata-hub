import { describe, it, expect, vi, beforeEach } from "vitest";

// actor.ts раньше не имел прямых тестов (только моки в других файлах) —
// requirePermission.test.ts мокает сам getActor(), не проверяя, как он
// реально собирает Actor из БД. Добавлено вместе с оптимизацией round-trip'ов
// (2026-09-07, "чем меньше запросов, тем быстрее"): getActor() больше не
// вызывает getCurrentUser() (это стоило отдельного round-trip'а только ради
// userId, который и без того известен из JWT) — тесты фиксируют новое
// поведение и защищают от повторной случайной сериализации в будущем.

const getSessionUserIdMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getSessionUserId: () => getSessionUserIdMock() }));

const userFindUnique = vi.fn();
const roleFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a), findFirst: (...a: unknown[]) => userFindUnique(...a) },
    role: { findUnique: (...a: unknown[]) => roleFindUnique(...a), findFirst: (...a: unknown[]) => roleFindUnique(...a) },
  },
}));

const { getActor } = await import("@/server/rbac/actor");

beforeEach(() => {
  getSessionUserIdMock.mockReset();
  userFindUnique.mockReset();
  roleFindUnique.mockReset();
});

describe("getActor()", () => {
  it("гость (нет сессии) — null, ни одного запроса к БД", async () => {
    getSessionUserIdMock.mockResolvedValue(null);

    const actor = await getActor();

    expect(actor).toBeNull();
    expect(userFindUnique).not.toHaveBeenCalled();
    expect(roleFindUnique).not.toHaveBeenCalled();
  });

  it("пользователь не найден (удалён) — null", async () => {
    getSessionUserIdMock.mockResolvedValue("u1");
    userFindUnique.mockResolvedValue(null);

    expect(await getActor()).toBeNull();
    expect(roleFindUnique).not.toHaveBeenCalled();
  });

  it("заблокированный пользователь — null", async () => {
    getSessionUserIdMock.mockResolvedValue("u1");
    userFindUnique.mockResolvedValue({
      role: "DANCER",
      isBlocked: true,
      email: "u@b.by",
      competitionRoleAssignments: [],
      competitionMemberships: [],
    });

    expect(await getActor()).toBeNull();
  });

  it("обычный пользователь (не site-admin) — SUPER_ADMIN-мост НЕ запрашивается, permissionsByCompetition собирается из CompetitionMember", async () => {
    getSessionUserIdMock.mockResolvedValue("u1");
    userFindUnique.mockResolvedValue({
      role: "DANCER",
      isBlocked: false,
      email: "u@b.by",
      competitionRoleAssignments: [],
      competitionMemberships: [
        {
          competitionId: "comp1",
          role: { permissions: [{ permission: { code: "score:submit" } }] },
        },
      ],
    });

    const actor = await getActor();

    expect(roleFindUnique).not.toHaveBeenCalled();
    expect(actor?.globalPermissions.size).toBe(0);
    expect(actor?.permissionsByCompetition.get("comp1")?.has("score:submit")).toBe(true);
  });

  it("глобальное назначение роли (UserRoleAssignment) даёт globalPermissions", async () => {
    getSessionUserIdMock.mockResolvedValue("u1");
    userFindUnique.mockResolvedValue({
      role: "DANCER",
      isBlocked: false,
      email: "u@b.by",
      competitionRoleAssignments: [{ role: { permissions: [{ permission: { code: "competition:create" } }] } }],
      competitionMemberships: [],
    });

    const actor = await getActor();

    expect(actor?.globalPermissions.has("competition:create")).toBe(true);
  });

  it("site-admin (User.role=ADMIN) — SUPER_ADMIN-мост запрашивается и мержится в globalPermissions (D2)", async () => {
    getSessionUserIdMock.mockResolvedValue("u1");
    userFindUnique.mockResolvedValue({
      role: "ADMIN",
      isBlocked: false,
      email: "admin@b.by",
      competitionRoleAssignments: [],
      competitionMemberships: [],
    });
    roleFindUnique.mockResolvedValue({
      permissions: [{ permission: { code: "draw:lock" } }],
    });

    const actor = await getActor();

    expect(roleFindUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { code: "SUPER_ADMIN" } }));
    expect(actor?.globalPermissions.has("draw:lock")).toBe(true);
  });
});
