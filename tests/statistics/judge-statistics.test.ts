import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Actor } from "@/server/rbac/actor";

const requirePermissionMock = vi.fn();
vi.mock("@/server/rbac/authorize", () => ({ requirePermission: (...a: unknown[]) => requirePermissionMock(...a) }));

const judgeAssignmentFindMany = vi.fn();
const judgeScoreFindMany = vi.fn();
const finalJudgeScoreFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    judgeAssignment: { findMany: (...a: unknown[]) => judgeAssignmentFindMany(...a) },
    judgeScore: { findMany: (...a: unknown[]) => judgeScoreFindMany(...a) },
    finalJudgeScore: { findMany: (...a: unknown[]) => finalJudgeScoreFindMany(...a) },
  },
}));

const { getJudgeStatisticsForCompetition } = await import("@/server/statistics/judge-statistics");

const actor: Actor = { userId: "admin1", email: "a@b.by", globalPermissions: new Set(), permissionsByCompetition: new Map() };

function drawParticipant(roundId: string) {
  return { draw: { heat: { roundId } } };
}

beforeEach(() => {
  requirePermissionMock.mockReset().mockResolvedValue(actor);
  judgeAssignmentFindMany.mockReset();
  judgeScoreFindMany.mockReset().mockResolvedValue([]);
  finalJudgeScoreFindMany.mockReset().mockResolvedValue([]);
});

describe("getJudgeStatisticsForCompetition()", () => {
  it("проверяет право statistics:view в рамках соревнования", async () => {
    judgeAssignmentFindMany.mockResolvedValue([]);
    await getJudgeStatisticsForCompetition("comp1");
    expect(requirePermissionMock).toHaveBeenCalledWith("statistics:view", "comp1");
  });

  it("пусто, если у соревнования нет ни одного судьи", async () => {
    judgeAssignmentFindMany.mockResolvedValue([]);
    expect(await getJudgeStatisticsForCompetition("comp1")).toEqual([]);
  });

  it("считает средний балл/разброс/согласие с панелью/долю выбросов", async () => {
    judgeAssignmentFindMany.mockResolvedValue([
      { id: "ja1", judgeUserId: "j1", judge: { email: "j1@b.by" } },
      { id: "ja2", judgeUserId: "j2", judge: { email: "j2@b.by" } },
      { id: "ja3", judgeUserId: "j3", judge: { email: "j3@b.by" } },
    ]);
    // j1 и j2 оценивают одинаково (полное согласие), j3 — противоположно и
    // совсем другими значениями (явный выброс на каждом участнике).
    judgeScoreFindMany.mockResolvedValue([
      { value: 4, maxValue: 4, judgeAssignmentId: "ja1", drawParticipantId: "p1", drawParticipant: drawParticipant("r1") },
      { value: 2, maxValue: 4, judgeAssignmentId: "ja1", drawParticipantId: "p2", drawParticipant: drawParticipant("r1") },
      { value: 0, maxValue: 4, judgeAssignmentId: "ja1", drawParticipantId: "p3", drawParticipant: drawParticipant("r1") },
      { value: 4, maxValue: 4, judgeAssignmentId: "ja2", drawParticipantId: "p1", drawParticipant: drawParticipant("r1") },
      { value: 2, maxValue: 4, judgeAssignmentId: "ja2", drawParticipantId: "p2", drawParticipant: drawParticipant("r1") },
      { value: 0, maxValue: 4, judgeAssignmentId: "ja2", drawParticipantId: "p3", drawParticipant: drawParticipant("r1") },
      { value: 0, maxValue: 4, judgeAssignmentId: "ja3", drawParticipantId: "p1", drawParticipant: drawParticipant("r1") },
      { value: 0, maxValue: 4, judgeAssignmentId: "ja3", drawParticipantId: "p2", drawParticipant: drawParticipant("r1") },
      { value: 4, maxValue: 4, judgeAssignmentId: "ja3", drawParticipantId: "p3", drawParticipant: drawParticipant("r1") },
    ]);

    const stats = await getJudgeStatisticsForCompetition("comp1");
    const byId = new Map(stats.map((s) => [s.judgeUserId, s]));

    const j1 = byId.get("j1")!;
    expect(j1.scoresCount).toBe(3);
    expect(j1.averageScore).toBeCloseTo(0.5, 5);
    expect(j1.scoreStdDev).toBeCloseTo(0.408248, 5);
    expect(j1.panelAgreement).toBeCloseTo(0.125, 5);
    expect(j1.outlierRate).toBe(0);

    // j2 идентичен j1 по построению сценария.
    const j2 = byId.get("j2")!;
    expect(j2.averageScore).toBeCloseTo(0.5, 5);
    expect(j2.outlierRate).toBe(0);

    const j3 = byId.get("j3")!;
    expect(j3.averageScore).toBeCloseTo(1 / 3, 5);
    expect(j3.panelAgreement).toBeCloseTo(-0.625, 5);
    expect(j3.outlierRate).toBe(1); // отклонился от единодушной панели на всех трёх участниках
  });

  it("нормализует оценки критериев финала по их собственному диапазону (min..max)", async () => {
    judgeAssignmentFindMany.mockResolvedValue([{ id: "ja1", judgeUserId: "j1", judge: { email: "j1@b.by" } }]);
    finalJudgeScoreFindMany.mockResolvedValue([
      {
        value: 8,
        criterionId: "crit1",
        judgeAssignmentId: "ja1",
        drawParticipantId: "p1",
        criterion: { minScore: 0, maxScore: 10 },
        drawParticipant: drawParticipant("r-final"),
      },
    ]);

    const stats = await getJudgeStatisticsForCompetition("comp1");
    expect(stats).toHaveLength(1);
    expect(stats[0].averageScore).toBeCloseTo(0.8, 5);
    expect(stats[0].scoresCount).toBe(1);
    // Единственная оценка без панели — согласие/выбросы не определены.
    expect(stats[0].panelAgreement).toBeNull();
    expect(stats[0].outlierRate).toBeNull();
  });
});
