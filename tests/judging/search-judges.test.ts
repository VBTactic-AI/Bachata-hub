import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Actor } from "@/server/rbac/actor";

const requirePermissionMock = vi.fn();
vi.mock("@/server/rbac/authorize", () => ({ requirePermission: (...a: unknown[]) => requirePermissionMock(...a) }));

const dancerFindMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { dancer: { findMany: (...a: unknown[]) => dancerFindMany(...a) } },
}));

const { searchJudgeCandidatesByName } = await import("@/server/judging/search-judges");

const actor: Actor = { userId: "u1", email: "a@b.by", globalPermissions: new Set(), permissionsByCompetition: new Map() };

beforeEach(() => {
  requirePermissionMock.mockReset().mockResolvedValue(actor);
  dancerFindMany.mockReset().mockResolvedValue([]);
});

// Судья ищется по имени профиля танцора (User.dancer.displayName) — судья
// сам по себе просто User (assignJudge ищет по User.email), но у него, как
// правило, тоже есть профиль танцора. Право — judge:assign, НЕ
// registration:manage (это другое действие, ForbiddenError за неправильное
// право был бы легко пропущен, если тестировать копипастой без проверки).
describe("searchJudgeCandidatesByName()", () => {
  it("проверяет judge:assign ИМЕННО для этого competitionId", async () => {
    await searchJudgeCandidatesByName("comp1", "Иван");
    expect(requirePermissionMock).toHaveBeenCalledWith("judge:assign", "comp1");
  });

  it("слишком короткий запрос (< 2 символов) не бьёт в базу", async () => {
    const result = await searchJudgeCandidatesByName("comp1", "И");
    expect(dancerFindMany).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it("'Иван*' ищет по startsWith", async () => {
    await searchJudgeCandidatesByName("comp1", "Иван*");
    expect(dancerFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { displayName: { startsWith: "Иван", mode: "insensitive" } },
      })
    );
  });

  it("возвращает judgeUserId (не dancerId) и email вместе с именем", async () => {
    dancerFindMany.mockResolvedValue([{ id: "d1", displayName: "Валейн Иван", user: { id: "u42", email: "ivan@b.by" } }]);

    const result = await searchJudgeCandidatesByName("comp1", "Валейн");

    expect(result).toEqual([{ judgeUserId: "u42", displayName: "Валейн Иван", email: "ivan@b.by" }]);
  });
});
