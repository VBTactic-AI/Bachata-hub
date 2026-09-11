import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Actor } from "@/server/rbac/actor";

const requirePermissionMock = vi.fn();
vi.mock("@/server/rbac/authorize", () => ({ requirePermission: (...a: unknown[]) => requirePermissionMock(...a) }));

const finalResultFindMany = vi.fn();
const finalJudgeScoreFindMany = vi.fn();
const judgeScoreFindMany = vi.fn();
const judgeAssignmentFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    finalResult: { findMany: (...a: unknown[]) => finalResultFindMany(...a) },
    finalJudgeScore: { findMany: (...a: unknown[]) => finalJudgeScoreFindMany(...a) },
    judgeScore: { findMany: (...a: unknown[]) => judgeScoreFindMany(...a) },
    judgeAssignment: { findMany: (...a: unknown[]) => judgeAssignmentFindMany(...a) },
  },
}));

const {
  getTopFinalParticipants,
  getCriteriaProfile,
  getScoreDistribution,
  getScoreDisputes,
  getJudgeActivity,
  getJudgingConsensus,
  getJudgingHighlights,
  getCriteriaComparisonTable,
} = await import("@/server/statistics/judging-analytics");

const actor: Actor = { userId: "admin1", email: "a@b.by", globalPermissions: new Set(), permissionsByCompetition: new Map() };

function participant(registrationId: string, name: string, bib: string | null, role: "LEADER" | "FOLLOWER" = "LEADER") {
  return { registrationId, role, registration: { dancer: { displayName: name }, checkIn: { bibNumber: bib } } };
}

beforeEach(() => {
  requirePermissionMock.mockReset().mockResolvedValue(actor);
  finalResultFindMany.mockReset().mockResolvedValue([]);
  finalJudgeScoreFindMany.mockReset().mockResolvedValue([]);
  judgeScoreFindMany.mockReset().mockResolvedValue([]);
  judgeAssignmentFindMany.mockReset().mockResolvedValue([]);
});

describe("getTopFinalParticipants()", () => {
  it("проверяет право statistics:view", async () => {
    await getTopFinalParticipants("comp1");
    expect(requirePermissionMock).toHaveBeenCalledWith("statistics:view", "comp1");
  });

  it("сортирует по totalScore и ограничивает лимитом; исключает RELATIVE_PLACEMENT на уровне запроса", async () => {
    finalResultFindMany.mockResolvedValue([
      { registrationId: "r2", role: "LEADER", totalScore: 35, place: 1, registration: { dancer: { displayName: "Б" }, checkIn: { bibNumber: "2" }, division: { category: { name: "Любители" } } } },
      { registrationId: "r1", role: "FOLLOWER", totalScore: 40, place: 1, registration: { dancer: { displayName: "А" }, checkIn: { bibNumber: "1" }, division: { category: { name: "Дебютанты" } } } },
    ]);
    const top = await getTopFinalParticipants("comp1", 10);
    // findMany уже отсортировал (orderBy totalScore desc) — проверяем, что запрос
    // действительно исключает RELATIVE_PLACEMENT и что маппинг полей верный.
    const call = finalResultFindMany.mock.calls[0][0];
    expect(call.where.finalSession.format.not).toBe("RELATIVE_PLACEMENT");
    expect(call.orderBy).toEqual({ totalScore: "desc" });
    expect(top).toHaveLength(2);
    expect(top[0]).toMatchObject({ registrationId: "r2", name: "Б", bibNumber: "2", categoryName: "Любители", totalScore: 35 });
  });
});

describe("getCriteriaProfile()", () => {
  it("группирует по категории/критерию и считает среднее, сортируя критерии по sortOrder", async () => {
    finalJudgeScoreFindMany.mockResolvedValue([
      { value: 8, criterion: { name: "Техника", maxScore: 10, sortOrder: 0, division: { category: { name: "Любители" } } } },
      { value: 6, criterion: { name: "Техника", maxScore: 10, sortOrder: 0, division: { category: { name: "Любители" } } } },
      { value: 9, criterion: { name: "Музыкальность", maxScore: 10, sortOrder: 1, division: { category: { name: "Любители" } } } },
    ]);
    const profile = await getCriteriaProfile("comp1");
    expect(profile).toHaveLength(1);
    expect(profile[0].categoryName).toBe("Любители");
    expect(profile[0].criteria).toEqual([
      { name: "Техника", average: 7, maxScore: 10 },
      { name: "Музыкальность", average: 9, maxScore: 10 },
    ]);
  });

  it("пусто, если ни одна категория не использовала критериальную систему", async () => {
    finalJudgeScoreFindMany.mockResolvedValue([]);
    expect(await getCriteriaProfile("comp1")).toEqual([]);
  });
});

describe("getScoreDistribution()", () => {
  it("раскладывает нормализованные оценки по 5 корзинам условной 10-балльной шкалы", async () => {
    // 0/4 -> 0 баллов (корзина 1-2), 2/4 -> 5 баллов (корзина 5-6), 4/4 -> 10 баллов (корзина 9-10)
    judgeScoreFindMany.mockResolvedValue([
      { value: 0, maxValue: 4, judgeAssignmentId: "ja1", judgeAssignment: { judgeUserId: "j1", judge: { email: "j1@b.by" } }, drawParticipant: participant("r1", "А", "1") ,},
      { value: 2, maxValue: 4, judgeAssignmentId: "ja1", judgeAssignment: { judgeUserId: "j1", judge: { email: "j1@b.by" } }, drawParticipant: participant("r2", "Б", "2") },
      { value: 4, maxValue: 4, judgeAssignmentId: "ja1", judgeAssignment: { judgeUserId: "j1", judge: { email: "j1@b.by" } }, drawParticipant: participant("r3", "В", "3") },
    ].map((s) => ({ ...s, drawParticipant: { ...s.drawParticipant, draw: { heat: { round: { id: "round1", type: null, stage: { name: "Отборочный" } } } } } })));
    const dist = await getScoreDistribution("comp1");
    expect(dist.find((b) => b.rangeLabel === "1–2")!.count).toBe(1);
    expect(dist.find((b) => b.rangeLabel === "5–6")!.count).toBe(1);
    expect(dist.find((b) => b.rangeLabel === "9–10")!.count).toBe(1);
    expect(dist.reduce((s, b) => s + b.count, 0)).toBe(3);
  });
});

describe("getScoreDisputes()", () => {
  it("находит самую спорную (наибольший разброс) и самую стабильную (наименьший) оценку", async () => {
    // Участник "спорный": 10,9,9,5,9 (один явный выброс) — пример из запроса пользователя.
    // Участник "стабильный": 8,8,8 (единодушны).
    const disputedJudges = [10, 9, 9, 5, 9].map((v, i) => ({
      value: v,
      maxValue: 10,
      judgeAssignmentId: `ja${i}`,
      judgeAssignment: { judgeUserId: `j${i}`, judge: { email: `j${i}@b.by` } },
      drawParticipant: { ...participant("r-disputed", "Спорный", "17"), draw: { heat: { round: { id: "round1", type: null, stage: { name: "Финал" } } } } },
    }));
    const stableJudges = [8, 8, 8].map((v, i) => ({
      value: v,
      maxValue: 10,
      judgeAssignmentId: `jb${i}`,
      judgeAssignment: { judgeUserId: `jb${i}`, judge: { email: `jb${i}@b.by` } },
      drawParticipant: { ...participant("r-stable", "Стабильный", "20"), draw: { heat: { round: { id: "round1", type: null, stage: { name: "Финал" } } } } },
    }));
    judgeScoreFindMany.mockResolvedValue([...disputedJudges, ...stableJudges]);

    const { mostControversial, mostConsistent } = await getScoreDisputes("comp1", 5);
    expect(mostControversial[0].registrationId).toBe("r-disputed");
    expect(mostControversial[0].spread).toBeCloseTo(0.5, 5); // (10-5)/10
    expect(mostControversial[0].perJudge.map((p) => p.rawValue)).toEqual([10, 9, 9, 9, 5]);
    expect(mostConsistent[0].registrationId).toBe("r-stable");
    expect(mostConsistent[0].spread).toBe(0);
  });

  it("не считает спором оценку с одним судьёй", async () => {
    judgeScoreFindMany.mockResolvedValue([
      {
        value: 4,
        maxValue: 4,
        judgeAssignmentId: "ja1",
        judgeAssignment: { judgeUserId: "j1", judge: { email: "j1@b.by" } },
        drawParticipant: { ...participant("r1", "А", "1"), draw: { heat: { round: { id: "round1", type: null, stage: { name: "Финал" } } } } },
      },
    ]);
    const { mostControversial, mostConsistent } = await getScoreDisputes("comp1", 5);
    expect(mostControversial).toEqual([]);
    expect(mostConsistent).toEqual([]);
  });
});

describe("getJudgeActivity()", () => {
  it("судья, подтвердивший все раунды, в которых ставил оценки — finished: true", async () => {
    judgeAssignmentFindMany.mockResolvedValue([
      {
        id: "ja1",
        judgeUserId: "j1",
        judge: { email: "j1@b.by", dancer: null },
        scores: [{ drawParticipant: { draw: { heat: { roundId: "r1" } } } }, { drawParticipant: { draw: { heat: { roundId: "r2" } } } }],
        confirmations: [{ roundId: "r1" }, { roundId: "r2" }],
      },
    ]);
    const activity = await getJudgeActivity("comp1");
    expect(activity[0]).toMatchObject({ judgeUserId: "j1", roundsTouched: 2, roundsConfirmed: 2, finished: true });
  });

  it("судья, ещё не подтвердивший часть раундов — finished: false", async () => {
    judgeAssignmentFindMany.mockResolvedValue([
      {
        id: "ja1",
        judgeUserId: "j1",
        judge: { email: "j1@b.by", dancer: null },
        scores: [{ drawParticipant: { draw: { heat: { roundId: "r1" } } } }, { drawParticipant: { draw: { heat: { roundId: "r2" } } } }],
        confirmations: [{ roundId: "r1" }],
      },
    ]);
    const activity = await getJudgeActivity("comp1");
    expect(activity[0]).toMatchObject({ roundsTouched: 2, roundsConfirmed: 1, finished: false });
  });
});

describe("getJudgingConsensus()", () => {
  it("взвешивает согласие/разброс числом оценок судьи", async () => {
    judgeAssignmentFindMany.mockResolvedValue([
      { id: "ja1", judgeUserId: "j1", judge: { email: "j1@b.by" } },
      { id: "ja2", judgeUserId: "j2", judge: { email: "j2@b.by" } },
    ]);
    judgeScoreFindMany.mockResolvedValue([
      { value: 4, maxValue: 4, judgeAssignmentId: "ja1", drawParticipantId: "p1", drawParticipant: { draw: { heat: { roundId: "r1" } } } },
      { value: 0, maxValue: 4, judgeAssignmentId: "ja1", drawParticipantId: "p2", drawParticipant: { draw: { heat: { roundId: "r1" } } } },
      { value: 4, maxValue: 4, judgeAssignmentId: "ja2", drawParticipantId: "p1", drawParticipant: { draw: { heat: { roundId: "r1" } } } },
      { value: 0, maxValue: 4, judgeAssignmentId: "ja2", drawParticipantId: "p2", drawParticipant: { draw: { heat: { roundId: "r1" } } } },
    ]);
    const consensus = await getJudgingConsensus("comp1");
    expect(consensus.agreement).toBeCloseTo(1, 5); // оба судьи ставят идентично
    expect(consensus.spread).toBeGreaterThan(0);
  });
});

function highlightScoreItem(
  judgeAssignmentId: string,
  judgeUserId: string,
  drawParticipantId: string,
  value: number,
  maxValue: number,
  participant: { name: string; bib: string; role: "LEADER" | "FOLLOWER" }
) {
  return {
    value,
    maxValue,
    judgeAssignmentId,
    drawParticipantId,
    judgeAssignment: { judgeUserId, judge: { email: `${judgeUserId}@b.by`, dancer: null } },
    drawParticipant: {
      registrationId: drawParticipantId,
      role: participant.role,
      registration: { dancer: { displayName: participant.name }, checkIn: { bibNumber: participant.bib } },
      draw: { heat: { roundId: "round1", round: { id: "round1", type: null, stage: { name: "Финал" } } } },
    },
  };
}

describe("getJudgingHighlights()", () => {
  it("находит судью с наивысшим средним, самого активного судью, самую высокую оценку и самого стабильного участника", async () => {
    judgeAssignmentFindMany.mockResolvedValue([
      { id: "ja1", judgeUserId: "j1", judge: { email: "j1@b.by", dancer: null } },
      { id: "ja2", judgeUserId: "j2", judge: { email: "j2@b.by", dancer: null } },
    ]);
    const p1 = { name: "Иван", bib: "1", role: "LEADER" as const };
    const p2 = { name: "Пётр", bib: "2", role: "LEADER" as const };
    const p3 = { name: "Соло", bib: "3", role: "LEADER" as const };
    judgeScoreFindMany.mockResolvedValue([
      highlightScoreItem("ja1", "j1", "r1", 8, 10, p1), // j1: 0.8
      highlightScoreItem("ja2", "j2", "r1", 9, 10, p1), // j2: 0.9 — разброс группы r1 = 0.1
      highlightScoreItem("ja1", "j1", "r2", 6, 10, p2), // j1: 0.6
      highlightScoreItem("ja2", "j2", "r2", 10, 10, p2), // j2: 1.0 — самая высокая оценка, разброс группы r2 = 0.4
      highlightScoreItem("ja1", "j1", "r3", 5, 10, p3), // единственный судья p3 — вне групп споров (< 2 судей)
    ]);

    const highlights = await getJudgingHighlights("comp1");

    // j2: avg = (0.9+1.0)/2 = 0.95; j1: avg = (0.8+0.6+0.5)/3 ≈ 0.633
    expect(highlights.topAverageJudge?.judgeName).toBe("j2@b.by");
    // j1 поставил 3 оценки, j2 — только 2
    expect(highlights.mostActiveJudge).toEqual({ judgeName: "j1@b.by", scoresCount: 3 });
    // 10/10 у Петра (r2) — выше, чем 9/10 у Ивана (r1); p3 не участвует (нет группы)
    expect(highlights.highestSingleScore).toMatchObject({ name: "Пётр", bibNumber: "2", rawValue: 10, rawMax: 10 });
    // r1 (Иван, 0.8/0.9) стабильнее r2 (Пётр, 0.6/1.0)
    expect(highlights.mostStableParticipant).toMatchObject({ name: "Иван", bibNumber: "1" });
    expect(highlights.mostStableParticipant?.spread).toBeCloseTo(0.1, 5);
  });

  it("null для показателей, которые не из чего посчитать (нет судей/оценок)", async () => {
    judgeAssignmentFindMany.mockResolvedValue([]);
    judgeScoreFindMany.mockResolvedValue([]);
    const highlights = await getJudgingHighlights("comp1");
    expect(highlights).toEqual({ topAverageJudge: null, mostActiveJudge: null, highestSingleScore: null, mostStableParticipant: null });
  });
});

describe("getCriteriaComparisonTable()", () => {
  it("проверяет право statistics:view и строит таблицу по категориям с критериями", async () => {
    finalResultFindMany.mockResolvedValue([
      {
        registrationId: "r1",
        role: "LEADER",
        totalScore: 27,
        criteriaTotals: { crit1: 9, crit2: 18 },
        registration: {
          dancer: { displayName: "Иван" },
          checkIn: { bibNumber: "1" },
          division: {
            category: { name: "Любители" },
            finalCriteria: [
              { id: "crit1", name: "Техника", maxScore: 10, sortOrder: 0, isActive: true },
              { id: "crit2", name: "Артистизм", maxScore: 20, sortOrder: 1, isActive: true },
              { id: "crit-hidden", name: "Устаревший", maxScore: 10, sortOrder: 2, isActive: false },
            ],
          },
        },
      },
    ]);
    const table = await getCriteriaComparisonTable("comp1");
    expect(requirePermissionMock).toHaveBeenCalledWith("statistics:view", "comp1");
    expect(table).toHaveLength(1);
    expect(table[0]).toMatchObject({ categoryName: "Любители", criteriaNames: ["Техника", "Артистизм"], maxScore: 20 });
    expect(table[0].rows[0]).toMatchObject({ name: "Иван", bibNumber: "1", total: 27, values: [9, 18] });
  });

  it("пропускает дивизионы без настроенных критериев (нечего сравнивать)", async () => {
    finalResultFindMany.mockResolvedValue([
      {
        registrationId: "r1",
        role: "LEADER",
        totalScore: 1,
        criteriaTotals: {},
        registration: {
          dancer: { displayName: "Иван" },
          checkIn: { bibNumber: "1" },
          division: { category: { name: "Скейтинг" }, finalCriteria: [] },
        },
      },
    ]);
    expect(await getCriteriaComparisonTable("comp1")).toEqual([]);
  });
});
