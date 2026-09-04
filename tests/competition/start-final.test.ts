import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Actor } from "@/server/rbac/actor";

const requirePermissionMock = vi.fn();
vi.mock("@/server/rbac/authorize", () => ({ requirePermission: (...a: unknown[]) => requirePermissionMock(...a) }));

const isFinalStageInTxMock = vi.fn();
vi.mock("@/server/judging/advancement", () => ({ isFinalStageInTx: (...a: unknown[]) => isFinalStageInTxMock(...a) }));

const getRoundEligiblePoolMock = vi.fn();
vi.mock("@/server/competition/draw-engine", () => ({ getRoundEligiblePool: (...a: unknown[]) => getRoundEligiblePoolMock(...a) }));

const roundFindUniqueOrThrow = vi.fn();
const finalSessionFindUnique = vi.fn();
const finalSettingsFindUnique = vi.fn();
const finalCriterionFindMany = vi.fn();
const judgeAssignmentFindMany = vi.fn();
const txFinalSessionCreate = vi.fn();
const auditCreate = vi.fn();

const fakeTx = { finalSession: { create: txFinalSessionCreate }, auditLog: { create: auditCreate } };

vi.mock("@/lib/prisma", () => ({
  prisma: {
    round: { findUniqueOrThrow: (...a: unknown[]) => roundFindUniqueOrThrow(...a) },
    finalSession: { findUnique: (...a: unknown[]) => finalSessionFindUnique(...a) },
    finalSettings: { findUnique: (...a: unknown[]) => finalSettingsFindUnique(...a) },
    finalCriterion: { findMany: (...a: unknown[]) => finalCriterionFindMany(...a) },
    judgeAssignment: { findMany: (...a: unknown[]) => judgeAssignmentFindMany(...a) },
    $transaction: (fn: (tx: unknown) => unknown) => fn(fakeTx),
  },
}));

const { checkFinalReadiness, startFinal } = await import("@/server/competition/start-final");
const { ValidationFailedError } = await import("@/server/errors");

const actor: Actor = { userId: "admin1", email: "a@b.by", globalPermissions: new Set(), permissionsByCompetition: new Map() };

const baseRound = { id: "final1", order: 5, status: "READY", divisionId: "div1", division: { id: "div1", competitionId: "comp1" } };
const criteria = [
  { id: "c1", name: "Техника", priority: 1, minScore: 0, maxScore: 10, step: 1, isActive: true },
  { id: "c2", name: "Музыкальность", priority: 2, minScore: 0, maxScore: 10, step: 1, isActive: true },
];

beforeEach(() => {
  requirePermissionMock.mockReset().mockResolvedValue(actor);
  isFinalStageInTxMock.mockReset().mockResolvedValue(true);
  getRoundEligiblePoolMock.mockReset().mockResolvedValue(new Set(["reg1"]));
  roundFindUniqueOrThrow.mockReset().mockResolvedValue(baseRound);
  finalSessionFindUnique.mockReset().mockResolvedValue(null);
  finalSettingsFindUnique.mockReset().mockResolvedValue({ format: "NORMAL", config: {} });
  finalCriterionFindMany.mockReset().mockResolvedValue(criteria);
  judgeAssignmentFindMany.mockReset().mockResolvedValue([{ role: "LEADER" }, { role: "FOLLOWER" }]);
  txFinalSessionCreate.mockReset().mockResolvedValue({ id: "session1" });
  auditCreate.mockReset();
});

describe("checkFinalReadiness()", () => {
  it("пустой список — всё готово", async () => {
    expect(await checkFinalReadiness("final1")).toEqual([]);
  });

  it("сообщает, что это не финальный раунд дивизиона", async () => {
    isFinalStageInTxMock.mockResolvedValue(false);
    const issues = await checkFinalReadiness("final1");
    expect(issues.length).toBe(1);
    expect(issues[0]).toMatch(/не финальный/);
  });

  it("сообщает о неподдержанном формате", async () => {
    finalSettingsFindUnique.mockResolvedValue({ format: "RANDOM_COUPLES", config: {} });
    const issues = await checkFinalReadiness("final1");
    expect(issues.some((i) => i.includes("RANDOM_COUPLES"))).toBe(true);
  });

  it("сообщает об отсутствии критериев", async () => {
    finalCriterionFindMany.mockResolvedValue([]);
    const issues = await checkFinalReadiness("final1");
    expect(issues.some((i) => i.includes("критери"))).toBe(true);
  });

  it("сообщает о непоследовательных приоритетах критериев", async () => {
    finalCriterionFindMany.mockResolvedValue([
      { id: "c1", name: "A", priority: 1, minScore: 0, maxScore: 10, step: 1, isActive: true },
      { id: "c2", name: "B", priority: 3, minScore: 0, maxScore: 10, step: 1, isActive: true },
    ]);
    const issues = await checkFinalReadiness("final1");
    expect(issues.some((i) => i.includes("подряд"))).toBe(true);
  });

  it("сообщает о некорректном диапазоне критерия", async () => {
    finalCriterionFindMany.mockResolvedValue([{ id: "c1", name: "Плохой", priority: 1, minScore: 10, maxScore: 5, step: 1, isActive: true }]);
    const issues = await checkFinalReadiness("final1");
    expect(issues.some((i) => i.includes("Плохой"))).toBe(true);
  });

  it("сообщает об отсутствии финалистов", async () => {
    getRoundEligiblePoolMock.mockResolvedValue(new Set());
    const issues = await checkFinalReadiness("final1");
    expect(issues.some((i) => i.includes("финалист"))).toBe(true);
  });

  it("сообщает об отсутствии судьи на роль, у которой есть финалисты", async () => {
    judgeAssignmentFindMany.mockResolvedValue([{ role: "LEADER" }]); // ведомых некому судить
    getRoundEligiblePoolMock.mockImplementation(async (_tx: unknown, params: { role: string }) => (params.role === "FOLLOWER" ? new Set(["reg2"]) : new Set(["reg1"])));
    const issues = await checkFinalReadiness("final1");
    expect(issues.some((i) => i.includes("Ведомый"))).toBe(true);
  });
});

describe("startFinal()", () => {
  it("отклоняет, если раунд не в статусе READY", async () => {
    roundFindUniqueOrThrow.mockResolvedValue({ ...baseRound, status: "DRAWING" });
    await expect(startFinal("final1")).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it("отклоняет, если есть незакрытые проблемы готовности", async () => {
    finalCriterionFindMany.mockResolvedValue([]);
    await expect(startFinal("final1")).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it("идемпотентно возвращает уже существующую сессию, не создаёт новую", async () => {
    finalSessionFindUnique.mockResolvedValue({ id: "existing-session" });
    const result = await startFinal("final1");
    expect(result).toEqual({ id: "existing-session" });
    expect(txFinalSessionCreate).not.toHaveBeenCalled();
  });

  it("создаёт FinalSession со снимком критериев и пишет аудит", async () => {
    const result = await startFinal("final1");
    expect(result).toEqual({ id: "session1" });
    expect(txFinalSessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          roundId: "final1",
          format: "NORMAL",
          criteriaSnapshot: [
            { id: "c1", name: "Техника", priority: 1, minScore: 0, maxScore: 10, step: 1 },
            { id: "c2", name: "Музыкальность", priority: 2, minScore: 0, maxScore: 10, step: 1 },
          ],
        }),
      })
    );
    expect(auditCreate).toHaveBeenCalledOnce();
    expect(auditCreate.mock.calls[0][0].data.action).toBe("final.start");
  });
});
