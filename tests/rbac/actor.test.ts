import { describe, it, expect, vi, beforeEach } from "vitest";

// actor.ts раньше не имел прямых тестов (только моки в других файлах) —
// requirePermission.test.ts мокает сам getActor(), не проверяя, как он
// реально собирает Actor из БД. Добавлено вместе с оптимизацией round-trip'ов
// (2026-09-07, "чем меньше запросов, тем быстрее"): getActor() больше не
// вызывает getCurrentUser() (это стоило отдельного round-trip'а только ради
// userId, который и без того известен из JWT) — тесты фиксируют новое
// поведение и защищают от повторной случайной сериализации в будущем.
//
// С переходом на Supabase Auth (2026-09-11) источник userId/aal —
// getAuthClaims(), не getSessionUserId() — см. src/lib/auth.ts.

const getAuthClaimsMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getAuthClaims: () => getAuthClaimsMock() }));

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
  getAuthClaimsMock.mockReset();
  userFindUnique.mockReset();
  roleFindUnique.mockReset();
});

describe("getActor()", () => {
  it("гость (нет сессии) — null, ни одного запроса к БД", async () => {
    getAuthClaimsMock.mockResolvedValue(null);

    const actor = await getActor();

    expect(actor).toBeNull();
    expect(userFindUnique).not.toHaveBeenCalled();
    expect(roleFindUnique).not.toHaveBeenCalled();
  });

  it("пользователь не найден (удалён) — null", async () => {
    getAuthClaimsMock.mockResolvedValue({ supabaseUserId: "su1", aal: "aal1" });
    userFindUnique.mockResolvedValue(null);

    expect(await getActor()).toBeNull();
    expect(roleFindUnique).not.toHaveBeenCalled();
  });

  it("заблокированный пользователь — null", async () => {
    getAuthClaimsMock.mockResolvedValue({ supabaseUserId: "su1", aal: "aal1" });
    userFindUnique.mockResolvedValue({
      id: "u1",
      role: "DANCER",
      isBlocked: true,
      email: "u@b.by",
      competitionRoleAssignments: [],
      competitionMemberships: [],
    });

    expect(await getActor()).toBeNull();
  });

  it("обычный пользователь (не site-admin) — SUPER_ADMIN-мост НЕ запрашивается, permissionsByCompetition собирается из CompetitionMember, MFA не требуется", async () => {
    getAuthClaimsMock.mockResolvedValue({ supabaseUserId: "su1", aal: "aal1" });
    userFindUnique.mockResolvedValue({
      id: "u1",
      role: "DANCER",
      isBlocked: false,
      email: "u@b.by",
      competitionRoleAssignments: [],
      competitionMemberships: [
        {
          competitionId: "comp1",
          role: { code: "COMPETITOR", permissions: [{ permission: { code: "score:submit" } }] },
        },
      ],
    });

    const actor = await getActor();

    expect(roleFindUnique).not.toHaveBeenCalled();
    expect(actor?.userId).toBe("u1");
    expect(actor?.globalPermissions.size).toBe(0);
    expect(actor?.permissionsByCompetition.get("comp1")?.has("score:submit")).toBe(true);
    expect(actor?.mfaRequired).toBe(false);
    expect(actor?.mfaSatisfied).toBe(true);
  });

  it("глобальное назначение роли (UserRoleAssignment) даёт globalPermissions", async () => {
    getAuthClaimsMock.mockResolvedValue({ supabaseUserId: "su1", aal: "aal1" });
    userFindUnique.mockResolvedValue({
      id: "u1",
      role: "DANCER",
      isBlocked: false,
      email: "u@b.by",
      competitionRoleAssignments: [
        { role: { code: "SUPER_ADMIN", permissions: [{ permission: { code: "competition:create" } }] } },
      ],
      competitionMemberships: [],
    });

    const actor = await getActor();

    expect(actor?.globalPermissions.has("competition:create")).toBe(true);
  });

  it("site-admin (User.role=ADMIN) — SUPER_ADMIN-мост запрашивается и мержится в globalPermissions (D2)", async () => {
    getAuthClaimsMock.mockResolvedValue({ supabaseUserId: "su1", aal: "aal1" });
    userFindUnique.mockResolvedValue({
      id: "u1",
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

  describe("MFA (src/server/mfa/policy.ts)", () => {
    it("site-admin (мост на SUPER_ADMIN) — mfaRequired=true, aal1 — mfaSatisfied=false", async () => {
      getAuthClaimsMock.mockResolvedValue({ supabaseUserId: "su1", aal: "aal1" });
      userFindUnique.mockResolvedValue({
        id: "u1",
        role: "ADMIN",
        isBlocked: false,
        email: "admin@b.by",
        competitionRoleAssignments: [],
        competitionMemberships: [],
      });
      roleFindUnique.mockResolvedValue({ permissions: [] });

      const actor = await getActor();

      expect(actor?.mfaRequired).toBe(true);
      expect(actor?.mfaSatisfied).toBe(false);
    });

    it("site-admin с aal2 — mfaSatisfied=true", async () => {
      getAuthClaimsMock.mockResolvedValue({ supabaseUserId: "su1", aal: "aal2" });
      userFindUnique.mockResolvedValue({
        id: "u1",
        role: "ADMIN",
        isBlocked: false,
        email: "admin@b.by",
        competitionRoleAssignments: [],
        competitionMemberships: [],
      });
      roleFindUnique.mockResolvedValue({ permissions: [] });

      const actor = await getActor();

      expect(actor?.mfaSatisfied).toBe(true);
    });

    it("EVENT_ADMIN по CompetitionMember в ОДНОМ соревновании — mfaRequired=true для всего актёра, не только для этого competitionId", async () => {
      getAuthClaimsMock.mockResolvedValue({ supabaseUserId: "su1", aal: "aal1" });
      userFindUnique.mockResolvedValue({
        id: "u1",
        role: "DANCER",
        isBlocked: false,
        email: "u@b.by",
        competitionRoleAssignments: [],
        competitionMemberships: [
          { competitionId: "comp1", role: { code: "EVENT_ADMIN", permissions: [] } },
        ],
      });

      const actor = await getActor();

      expect(actor?.mfaRequired).toBe(true);
      expect(actor?.mfaSatisfied).toBe(false);
    });

    it("JUDGE/SCORER/DJ/MC/COMPETITOR — MFA не обязательна (сужена до SUPER_ADMIN/EVENT_ADMIN)", async () => {
      getAuthClaimsMock.mockResolvedValue({ supabaseUserId: "su1", aal: "aal1" });
      userFindUnique.mockResolvedValue({
        id: "u1",
        role: "DANCER",
        isBlocked: false,
        email: "j@b.by",
        competitionRoleAssignments: [],
        competitionMemberships: [{ competitionId: "comp1", role: { code: "HEAD_JUDGE", permissions: [] } }],
      });

      const actor = await getActor();

      expect(actor?.mfaRequired).toBe(false);
      expect(actor?.mfaSatisfied).toBe(true);
    });
  });
});
