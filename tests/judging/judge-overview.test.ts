import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Actor } from "@/server/rbac/actor";

const requirePermissionMock = vi.fn();
vi.mock("@/server/rbac/authorize", () => ({ requirePermission: (...a: unknown[]) => requirePermissionMock(...a) }));

const judgeAssignmentFindMany = vi.fn();
const divisionFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    judgeAssignment: { findMany: (...a: unknown[]) => judgeAssignmentFindMany(...a) },
    division: { findMany: (...a: unknown[]) => divisionFindMany(...a) },
  },
}));

const { getJudgeDivisionsOverview } = await import("@/server/judging/judge-overview");

const actor: Actor = { userId: "judge1", email: "j@b.by", globalPermissions: new Set(), permissionsByCompetition: new Map() };

beforeEach(() => {
  requirePermissionMock.mockReset().mockResolvedValue(actor);
  judgeAssignmentFindMany.mockReset();
  divisionFindMany.mockReset();
});

// getJudgeDivisionsOverview() — структура "мои категории → их этапы" для
// вкладок на экране судьи (2026-09-10, редизайн навигации, по прямому
// запросу пользователя). В отличие от getJudgeQueue (только заходы, где уже
// есть кого оценивать), здесь — ВСЕ раунды дивизиона, включая ещё не
// начавшиеся: судья должен видеть всю сетку этапов категории сразу.
describe("getJudgeDivisionsOverview()", () => {
  it("пустой список, если судья вообще не назначен ни на одну категорию", async () => {
    judgeAssignmentFindMany.mockResolvedValue([]);

    const result = await getJudgeDivisionsOverview("comp1");

    expect(result).toEqual([]);
    expect(divisionFindMany).not.toHaveBeenCalled();
  });

  it("собирает раунды дивизиона с меткой из stage.name для обычных этапов и ROUND_TYPE_LABELS для служебных (TIE_BREAK)", async () => {
    judgeAssignmentFindMany.mockResolvedValue([{ id: "asg1", divisionId: "div1", role: "LEADER" }]);
    divisionFindMany.mockResolvedValue([
      {
        id: "div1",
        category: { name: "Любители", order: 1 },
        rounds: [
          { id: "r1", status: "COMPLETED", type: null, stage: { name: "Отборочный" }, finalSession: null },
          { id: "r2", status: "RUNNING", type: "TIE_BREAK", stage: null, finalSession: null },
          { id: "r3", status: "RUNNING", type: null, stage: { name: "Финал" }, finalSession: { id: "fs1" } },
        ],
      },
    ]);

    const result = await getJudgeDivisionsOverview("comp1");

    expect(result).toEqual([
      {
        divisionId: "div1",
        categoryName: "Любители",
        rounds: [
          { roundId: "r1", status: "COMPLETED", label: "Отборочный", isFinal: false },
          { roundId: "r2", status: "RUNNING", label: "Перетанцовка", isFinal: false },
          { roundId: "r3", status: "RUNNING", label: "Финал", isFinal: true },
        ],
      },
    ]);
  });

  it("сортирует категории по DivisionCategory.order", async () => {
    judgeAssignmentFindMany.mockResolvedValue([
      { id: "asg1", divisionId: "div-b", role: "LEADER" },
      { id: "asg2", divisionId: "div-a", role: "FOLLOWER" },
    ]);
    divisionFindMany.mockResolvedValue([
      { id: "div-b", category: { name: "Б", order: 2 }, rounds: [] },
      { id: "div-a", category: { name: "А", order: 1 }, rounds: [] },
    ]);

    const result = await getJudgeDivisionsOverview("comp1");

    expect(result.map((d) => d.divisionId)).toEqual(["div-a", "div-b"]);
  });

  it("не дублирует дивизион, если судья назначен на обе роли (LEADER и FOLLOWER)", async () => {
    judgeAssignmentFindMany.mockResolvedValue([
      { id: "asg1", divisionId: "div1", role: "LEADER" },
      { id: "asg2", divisionId: "div1", role: "FOLLOWER" },
    ]);
    divisionFindMany.mockResolvedValue([{ id: "div1", category: { name: "Профи", order: 1 }, rounds: [] }]);

    const result = await getJudgeDivisionsOverview("comp1");

    expect(result).toHaveLength(1);
    expect(divisionFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ["div1"] } } }));
  });
});
