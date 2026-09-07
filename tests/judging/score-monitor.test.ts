import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Actor } from "@/server/rbac/actor";

const requirePermissionMock = vi.fn();
vi.mock("@/server/rbac/authorize", () => ({ requirePermission: (...a: unknown[]) => requirePermissionMock(...a) }));

const roundFindUniqueOrThrow = vi.fn();
const roundCount = vi.fn();
const heatFindMany = vi.fn();
const judgeAssignmentFindMany = vi.fn();
const judgeRoundConfirmationFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    round: { findUniqueOrThrow: (...a: unknown[]) => roundFindUniqueOrThrow(...a), count: (...a: unknown[]) => roundCount(...a) },
    heat: { findMany: (...a: unknown[]) => heatFindMany(...a) },
    judgeAssignment: { findMany: (...a: unknown[]) => judgeAssignmentFindMany(...a) },
    judgeRoundConfirmation: { findMany: (...a: unknown[]) => judgeRoundConfirmationFindMany(...a) },
  },
}));

const { getPrelimScoreMonitor, getFinalScoreMonitor } = await import("@/server/judging/score-monitor");

const actor: Actor = { userId: "admin1", email: "a@b.by", globalPermissions: new Set(), permissionsByCompetition: new Map() };

function judgeAssignment(id: string, role: "LEADER" | "FOLLOWER", judge: { email: string; dancerDisplayName?: string }) {
  return { id, role, judge: { email: judge.email, dancer: judge.dancerDisplayName ? { displayName: judge.dancerDisplayName } : null } };
}

function participant(id: string, role: "LEADER" | "FOLLOWER", bibNumber: string, judgeScores: { judgeAssignmentId: string; value: number }[]) {
  return { id, role, registration: { checkIn: { bibNumber } }, judgeScores };
}

beforeEach(() => {
  requirePermissionMock.mockReset().mockResolvedValue(actor);
  roundFindUniqueOrThrow.mockReset();
  roundCount.mockReset().mockResolvedValue(1); // не финал по умолчанию (isFinalStageInTx)
  heatFindMany.mockReset().mockResolvedValue([]);
  judgeAssignmentFindMany.mockReset().mockResolvedValue([]);
  judgeRoundConfirmationFindMany.mockReset().mockResolvedValue([]);
});

describe("getPrelimScoreMonitor() — числовая шкала (не Да/Нет)", () => {
  it("собирает ячейки по (участник, судья) и правильный ИТОГО по каждому судье", async () => {
    roundFindUniqueOrThrow.mockResolvedValue({
      divisionId: "div1",
      // finalistsCount МЕНЬШЕ числа участников роли — иначе rolesNotNeedingJudging
      // (реальная, немокнутая логика) пометит роль как не требующую судейства
      // и ИТОГО всегда будет 0/0 (участников <= мест, все проходят сами).
      finalistsCount: 1,
      order: 1,
      type: null,
      judgingMaxScore: 10,
      division: { competitionId: "comp1" },
    });
    const j1 = judgeAssignment("j1", "LEADER", { email: "judge1@x.com", dancerDisplayName: "Иван Судьёв" });
    judgeAssignmentFindMany.mockResolvedValue([j1]);
    const pA = participant("pA", "LEADER", "101", [{ judgeAssignmentId: "j1", value: 7 }]);
    const pB = participant("pB", "LEADER", "102", []);
    heatFindMany.mockResolvedValue([{ draws: [{ participants: [pA, pB] }] }]);

    const monitor = await getPrelimScoreMonitor("round1");

    expect(requirePermissionMock).toHaveBeenCalledWith("score:view_all", "comp1");
    expect(monitor.leader.judges).toEqual([{ judgeAssignmentId: "j1", displayName: "Иван Судьёв", isEmailFallback: false }]);
    expect(monitor.leader.rows.map((r) => [r.bibNumber, r.scores.j1])).toEqual([
      ["101", 7],
      ["102", null],
    ]);
    expect(monitor.leader.totals).toEqual([{ judgeAssignmentId: "j1", required: 2, submitted: 1, complete: false }]);
  });

  it("судья без профиля танцора — displayName это часть email, isEmailFallback=true", async () => {
    roundFindUniqueOrThrow.mockResolvedValue({
      divisionId: "div1",
      finalistsCount: 10,
      order: 1,
      type: null,
      judgingMaxScore: 10,
      division: { competitionId: "comp1" },
    });
    judgeAssignmentFindMany.mockResolvedValue([judgeAssignment("j1", "LEADER", { email: "noprofile@x.com" })]);
    heatFindMany.mockResolvedValue([]);

    const monitor = await getPrelimScoreMonitor("round1");

    expect(monitor.leader.judges).toEqual([{ judgeAssignmentId: "j1", displayName: "noprofile", isEmailFallback: true }]);
  });
});

describe("getPrelimScoreMonitor() — формат «Да/Нет» (judgingMaxScore=1): ИТОГО по confirmJudgeRoundDone, не по сырым кликам", () => {
  it("сырая оценка есть, но судья ещё не нажал «Готово» — ИТОГО 0/1, не 1/1", async () => {
    roundFindUniqueOrThrow.mockResolvedValue({
      divisionId: "div1",
      // 2 участника роли > 1 места — роль не пропускается (rolesNotNeedingJudging).
      finalistsCount: 1,
      order: 1,
      type: null,
      judgingMaxScore: 1,
      division: { competitionId: "comp1" },
    });
    judgeAssignmentFindMany.mockResolvedValue([judgeAssignment("j1", "FOLLOWER", { email: "j1@x.com", dancerDisplayName: "Судья 1" })]);
    heatFindMany.mockResolvedValue([
      {
        draws: [
          {
            participants: [
              participant("pA", "FOLLOWER", "1", [{ judgeAssignmentId: "j1", value: 1 }]),
              participant("pB", "FOLLOWER", "2", []),
            ],
          },
        ],
      },
    ]);
    judgeRoundConfirmationFindMany.mockResolvedValue([]); // "Готово" ещё не нажато

    const monitor = await getPrelimScoreMonitor("round1");

    expect(monitor.follower.totals).toEqual([{ judgeAssignmentId: "j1", required: 1, submitted: 0, complete: false }]);
  });

  it("после «Готово» (JudgeRoundConfirmation) — ИТОГО 1/1, complete=true", async () => {
    roundFindUniqueOrThrow.mockResolvedValue({
      divisionId: "div1",
      finalistsCount: 1,
      order: 1,
      type: null,
      judgingMaxScore: 1,
      division: { competitionId: "comp1" },
    });
    judgeAssignmentFindMany.mockResolvedValue([judgeAssignment("j1", "FOLLOWER", { email: "j1@x.com", dancerDisplayName: "Судья 1" })]);
    heatFindMany.mockResolvedValue([
      {
        draws: [
          {
            participants: [
              participant("pA", "FOLLOWER", "1", [{ judgeAssignmentId: "j1", value: 1 }]),
              participant("pB", "FOLLOWER", "2", []),
            ],
          },
        ],
      },
    ]);
    judgeRoundConfirmationFindMany.mockResolvedValue([{ judgeAssignmentId: "j1" }]);

    const monitor = await getPrelimScoreMonitor("round1");

    expect(monitor.follower.totals).toEqual([{ judgeAssignmentId: "j1", required: 1, submitted: 1, complete: true }]);
  });
});

describe("getPrelimScoreMonitor() — роль без отсева (rolesNotNeedingJudging)", () => {
  it("участников роли <= мест, не финал — ИТОГО 0/0 complete=true, даже если судья назначен", async () => {
    roundFindUniqueOrThrow.mockResolvedValue({
      divisionId: "div1",
      finalistsCount: 10,
      order: 1,
      type: null,
      judgingMaxScore: 5,
      division: { competitionId: "comp1" },
    });
    roundCount.mockResolvedValue(1); // не финал
    judgeAssignmentFindMany.mockResolvedValue([judgeAssignment("j1", "LEADER", { email: "j1@x.com", dancerDisplayName: "Судья" })]);
    // 3 лидера <= 10 мест — роль не оценивается.
    heatFindMany.mockResolvedValue([
      { draws: [{ participants: [participant("p1", "LEADER", "1", []), participant("p2", "LEADER", "2", []), participant("p3", "LEADER", "3", [])] }] },
    ]);

    const monitor = await getPrelimScoreMonitor("round1");

    expect(monitor.leader.totals).toEqual([{ judgeAssignmentId: "j1", required: 0, submitted: 0, complete: true }]);
  });
});

describe("getFinalScoreMonitor()", () => {
  it("возвращает null, если финал у раунда ещё не начат (finalSession отсутствует)", async () => {
    roundFindUniqueOrThrow.mockResolvedValue({ divisionId: "div1", division: { competitionId: "comp1" }, finalSession: null });

    const monitor = await getFinalScoreMonitor("round1");

    expect(monitor).toBeNull();
    expect(requirePermissionMock).toHaveBeenCalledWith("score:view_all", "comp1");
  });

  it("считает ИТОГО по (участник × применимый критерий) на судью — не по количеству критериев вообще", async () => {
    roundFindUniqueOrThrow.mockResolvedValue({
      divisionId: "div1",
      division: { competitionId: "comp1" },
      finalSession: {
        format: "NORMAL",
        config: {},
        criteriaSnapshot: [
          { id: "c1", name: "Timing", priority: 1, minScore: 0, maxScore: 10, step: 1 },
          { id: "c2", name: "Technique", priority: 2, minScore: 0, maxScore: 10, step: 1 },
        ],
      },
    });
    judgeAssignmentFindMany.mockResolvedValue([judgeAssignment("j1", "LEADER", { email: "j1@x.com", dancerDisplayName: "Судья Ф" })]);
    heatFindMany.mockResolvedValue([
      {
        draws: [
          {
            participants: [
              {
                id: "pA",
                role: "LEADER",
                registration: { checkIn: { bibNumber: "1" } },
                finalJudgeScores: [{ judgeAssignmentId: "j1", criterionId: "c1", value: 8 }],
              },
            ],
          },
        ],
      },
    ]);

    const monitor = await getFinalScoreMonitor("round1");

    expect(monitor).not.toBeNull();
    expect(monitor!.leader.rows[0].scores.j1).toEqual({ c1: 8, c2: null });
    // required=2 (2 критерия × 1 участник), submitted=1 (только c1 оценён) — не завершено.
    expect(monitor!.leader.totals).toEqual([{ judgeAssignmentId: "j1", required: 2, submitted: 1, complete: false }]);
  });

  it("JUDGES_DANCE: критерий «танцующего судьи» не входит в required судьи ЭТОЙ ЖЕ роли участника", async () => {
    roundFindUniqueOrThrow.mockResolvedValue({
      divisionId: "div1",
      division: { competitionId: "comp1" },
      finalSession: {
        format: "JUDGES_DANCE",
        config: { dancingJudgeCriteriaIds: ["partnership"] },
        criteriaSnapshot: [{ id: "partnership", name: "Партнёрство", priority: 1, minScore: 0, maxScore: 10, step: 1 }],
      },
    });
    // Судья роли LEADER оценивает партнёрство у FOLLOWER-участников (allowedJudgeRole
    // возвращает противоположную роль для критерия из dancingJudgeCriteriaIds) — то
    // есть в табличке "для судей-ведущих" (роль LEADER) участников роли LEADER
    // этот критерий не требуется вообще (required=0), его ставит судья FOLLOWER.
    judgeAssignmentFindMany.mockResolvedValue([judgeAssignment("j1", "LEADER", { email: "j1@x.com", dancerDisplayName: "Судья Л" })]);
    heatFindMany.mockResolvedValue([
      { draws: [{ participants: [{ id: "pA", role: "LEADER", registration: { checkIn: { bibNumber: "1" } }, finalJudgeScores: [] }] }] },
    ]);

    const monitor = await getFinalScoreMonitor("round1");

    expect(monitor!.leader.totals).toEqual([{ judgeAssignmentId: "j1", required: 0, submitted: 0, complete: true }]);
    expect(monitor!.leader.rows[0].scores.j1).toEqual({ partnership: null });
  });
});
