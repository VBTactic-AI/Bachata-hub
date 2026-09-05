import { describe, it, expect, vi, beforeEach } from "vitest";

const resultFindMany = vi.fn();
const roundResultFindMany = vi.fn();
const judgeScoreFindMany = vi.fn();
const finalJudgeScoreFindMany = vi.fn();
const registrationFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    result: { findMany: (...a: unknown[]) => resultFindMany(...a) },
    roundResult: { findMany: (...a: unknown[]) => roundResultFindMany(...a) },
    judgeScore: { findMany: (...a: unknown[]) => judgeScoreFindMany(...a) },
    finalJudgeScore: { findMany: (...a: unknown[]) => finalJudgeScoreFindMany(...a) },
    registration: { findMany: (...a: unknown[]) => registrationFindMany(...a) },
  },
}));

const { getCompetitorStatistics } = await import("@/server/statistics/competitor-statistics");

beforeEach(() => {
  resultFindMany.mockReset().mockResolvedValue([]);
  roundResultFindMany.mockReset().mockResolvedValue([]);
  judgeScoreFindMany.mockReset().mockResolvedValue([]);
  finalJudgeScoreFindMany.mockReset().mockResolvedValue([]);
  registrationFindMany.mockReset().mockResolvedValue([]);
});

describe("getCompetitorStatistics()", () => {
  it("всё по нулям/null, если человек ещё ни разу не соревновался", async () => {
    const stats = await getCompetitorStatistics("dancer1");
    expect(stats.overall).toEqual({
      competitionsCount: 0,
      winsCount: 0,
      podiumsCount: 0,
      finalsCount: 0,
      bestPlacement: null,
      averagePlacement: null,
      averageScore: null,
      qualificationRate: null,
    });
  });

  it("берёт только ТЕКУЩУЮ (последнюю) версию Result на дивизион+регистрацию", async () => {
    resultFindMany.mockResolvedValue([
      {
        divisionId: "d1",
        registrationId: "r1",
        version: 2,
        status: "FINALIST",
        placement: 2,
        registration: { role: "LEADER", competitionId: "c1" },
      },
      {
        // старая версия того же результата — должна быть проигнорирована
        divisionId: "d1",
        registrationId: "r1",
        version: 1,
        status: "FINALIST",
        placement: 1,
        registration: { role: "LEADER", competitionId: "c1" },
      },
    ]);

    const stats = await getCompetitorStatistics("dancer1");
    expect(stats.overall.bestPlacement).toBe(2);
    expect(stats.overall.winsCount).toBe(0);
  });

  it("считает победы/подиумы/финалы/среднее место по нескольким соревнованиям", async () => {
    resultFindMany.mockResolvedValue([
      { divisionId: "d1", registrationId: "r1", version: 1, status: "FINALIST", placement: 1, registration: { role: "LEADER", competitionId: "c1" } },
      { divisionId: "d2", registrationId: "r2", version: 1, status: "FINALIST", placement: 5, registration: { role: "LEADER", competitionId: "c2" } },
      { divisionId: "d3", registrationId: "r3", version: 1, status: "ELIMINATED", placement: null, registration: { role: "FOLLOWER", competitionId: "c3" } },
    ]);

    const stats = await getCompetitorStatistics("dancer1");
    expect(stats.overall.competitionsCount).toBe(3);
    expect(stats.overall.winsCount).toBe(1);
    expect(stats.overall.podiumsCount).toBe(1); // только место 1 — в топ-3, место 5 нет
    expect(stats.overall.finalsCount).toBe(2);
    expect(stats.overall.bestPlacement).toBe(1);
    expect(stats.overall.averagePlacement).toBe(3); // (1+5)/2

    expect(stats.byRole.LEADER.competitionsCount).toBe(2);
    expect(stats.byRole.FOLLOWER.competitionsCount).toBe(1);
    expect(stats.byRole.FOLLOWER.finalsCount).toBe(0);
  });

  it("считает долю прохождения дальше (qualificationRate) по RoundResult, кроме перетанцовок-в-ожидании", async () => {
    roundResultFindMany.mockResolvedValue([
      { status: "ADVANCED", registration: { role: "LEADER" } },
      { status: "ADVANCED", registration: { role: "LEADER" } },
      { status: "ELIMINATED", registration: { role: "LEADER" } },
      { status: "TIE_BREAK_REQUIRED", registration: { role: "LEADER" } }, // не должно попасть в знаменатель
    ]);

    const stats = await getCompetitorStatistics("dancer1");
    expect(stats.overall.qualificationRate).toBeCloseTo(2 / 3, 5);
  });

  it("нормализует средний балл и по обычной шкале, и по критериям финала", async () => {
    judgeScoreFindMany.mockResolvedValue([{ value: 1, maxValue: 2, drawParticipant: { role: "LEADER" } }]); // 0.5
    finalJudgeScoreFindMany.mockResolvedValue([
      { value: 3, criterion: { minScore: 0, maxScore: 6 }, drawParticipant: { role: "LEADER" } }, // 0.5
    ]);

    const stats = await getCompetitorStatistics("dancer1");
    expect(stats.overall.averageScore).toBeCloseTo(0.5, 5);
  });
});
