import { describe, it, expect, vi, beforeEach } from "vitest";

const competitionFindUnique = vi.fn();
const divisionFindMany = vi.fn();
const judgeAssignmentFindMany = vi.fn();
const heatFindFirst = vi.fn();
const roundFindMany = vi.fn();
const resultFindMany = vi.fn();
const registrationGroupBy = vi.fn();
const registrationFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    competition: { findUnique: (...a: unknown[]) => competitionFindUnique(...a) },
    division: { findMany: (...a: unknown[]) => divisionFindMany(...a) },
    judgeAssignment: { findMany: (...a: unknown[]) => judgeAssignmentFindMany(...a) },
    heat: { findFirst: (...a: unknown[]) => heatFindFirst(...a) },
    round: { findMany: (...a: unknown[]) => roundFindMany(...a) },
    result: { findMany: (...a: unknown[]) => resultFindMany(...a) },
    registration: { groupBy: (...a: unknown[]) => registrationGroupBy(...a), findMany: (...a: unknown[]) => registrationFindMany(...a) },
  },
}));

const { getPublicCompetitionView, roundLabel } = await import("@/server/public/public-competition-view");

const baseCompetition = {
  id: "comp1",
  name: "Minsk Open",
  status: "REGISTRATION_OPEN",
  description: null,
  organizerName: null,
  venue: null,
  startAt: null,
  endAt: null,
  publicResults: false,
  rulesText: null,
  rulesUrl: null,
  mediaUrl: null,
  city: null,
  event: null,
};

beforeEach(() => {
  competitionFindUnique.mockReset().mockResolvedValue(baseCompetition);
  divisionFindMany.mockReset().mockResolvedValue([]);
  judgeAssignmentFindMany.mockReset().mockResolvedValue([]);
  heatFindFirst.mockReset().mockResolvedValue(null);
  roundFindMany.mockReset().mockResolvedValue([]);
  resultFindMany.mockReset().mockResolvedValue([]);
  registrationGroupBy.mockReset().mockResolvedValue([]);
  registrationFindMany.mockReset().mockResolvedValue([]);
});

describe("roundLabel()", () => {
  it("берёт название этапа справочника, если оно есть", () => {
    expect(roundLabel({ stage: { name: "Полуфинал" }, type: null })).toBe("Полуфинал");
  });
  it("иначе подписывает служебный тип (TIE_BREAK -> «Перетанцовка»)", () => {
    expect(roundLabel({ stage: null, type: "TIE_BREAK" })).toBe("Перетанцовка");
  });
});

describe("getPublicCompetitionView()", () => {
  it("null для DRAFT-соревнования (скрыто от посторонних)", async () => {
    competitionFindUnique.mockResolvedValue({ ...baseCompetition, status: "DRAFT" });
    expect(await getPublicCompetitionView("comp1")).toBeNull();
  });

  it("null, если соревнования не существует", async () => {
    competitionFindUnique.mockResolvedValue(null);
    expect(await getPublicCompetitionView("comp1")).toBeNull();
  });

  it("судьи без профиля танцора не попадают в публичный список (только email — приватные данные)", async () => {
    judgeAssignmentFindMany.mockResolvedValue([
      { judgeUserId: "j1", judge: { dancer: { displayName: "Судья Иванов" } } },
      { judgeUserId: "j2", judge: { dancer: null } },
    ]);
    const view = await getPublicCompetitionView("comp1");
    expect(view!.judges).toEqual([{ displayName: "Судья Иванов" }]);
  });

  it("результаты пустые, пока Competition.publicResults=false — Result вообще не запрашивается", async () => {
    const view = await getPublicCompetitionView("comp1");
    expect(view!.resultsPublished).toBe(false);
    expect(view!.results).toEqual([]);
    expect(resultFindMany).not.toHaveBeenCalled();
  });

  it("результаты берут только ТЕКУЩУЮ (последнюю) версию на дивизион+регистрацию", async () => {
    competitionFindUnique.mockResolvedValue({ ...baseCompetition, publicResults: true });
    resultFindMany.mockResolvedValue([
      {
        divisionId: "d1",
        registrationId: "r1",
        version: 2,
        status: "FINALIST",
        placement: 2,
        division: { category: { name: "Любители" } },
        registration: { role: "LEADER", dancer: { displayName: "Иван" }, checkIn: { bibNumber: "5" } },
      },
      {
        divisionId: "d1",
        registrationId: "r1",
        version: 1,
        status: "FINALIST",
        placement: 1,
        division: { category: { name: "Любители" } },
        registration: { role: "LEADER", dancer: { displayName: "Иван" }, checkIn: { bibNumber: "5" } },
      },
    ]);
    const view = await getPublicCompetitionView("comp1");
    expect(view!.results).toEqual([{ divisionCategoryName: "Любители", role: "LEADER", displayName: "Иван", bibNumber: "5", status: "FINALIST", placement: 2 }]);
  });

  it("прогресс по категориям: промежуточный раунд гейтится advancementPublishedAt, финал — publicResults", async () => {
    competitionFindUnique.mockResolvedValue({ ...baseCompetition, publicResults: true });
    divisionFindMany.mockResolvedValue([{ id: "d1", category: { name: "Дебютанты" }, _count: { registrations: 2 } }]);
    roundFindMany.mockResolvedValue([
      {
        id: "r1",
        divisionId: "d1",
        stage: { name: "Четвертьфинал" },
        advancementPublishedAt: new Date(),
        results: [
          { registrationId: "regA", status: "ADVANCED" },
          { registrationId: "regB", status: "ELIMINATED" },
        ],
      },
      { id: "r2", divisionId: "d1", stage: { name: "Финал" }, advancementPublishedAt: null, results: [] },
    ]);
    registrationFindMany.mockResolvedValue([
      { id: "regA", divisionId: "d1", role: "LEADER", dancer: { displayName: "Иван" }, checkIn: { bibNumber: "1" } },
      { id: "regB", divisionId: "d1", role: "LEADER", dancer: { displayName: "Пётр" }, checkIn: { bibNumber: "2" } },
    ]);
    resultFindMany.mockResolvedValue([
      {
        divisionId: "d1",
        registrationId: "regA",
        version: 1,
        status: "FINALIST",
        placement: 1,
        division: { category: { name: "Дебютанты" } },
        registration: { role: "LEADER", dancer: { displayName: "Иван" }, checkIn: { bibNumber: "1" } },
      },
      {
        divisionId: "d1",
        registrationId: "regB",
        version: 1,
        status: "ELIMINATED",
        placement: null,
        division: { category: { name: "Дебютанты" } },
        registration: { role: "LEADER", dancer: { displayName: "Пётр" }, checkIn: { bibNumber: "2" } },
      },
    ]);

    const view = await getPublicCompetitionView("comp1");
    expect(view!.divisionProgress).toEqual([
      {
        divisionId: "d1",
        columns: [
          { roundId: "r1", label: "Четвертьфинал", isFinal: false },
          { roundId: "r2", label: "Финал", isFinal: true },
        ],
        rows: [
          { divisionCategoryName: "Дебютанты", role: "LEADER", displayName: "Иван", bibNumber: "1", cells: { r1: "ADVANCED", r2: 1 } },
          { divisionCategoryName: "Дебютанты", role: "LEADER", displayName: "Пётр", bibNumber: "2", cells: { r1: "ELIMINATED", r2: "ELIMINATED" } },
        ],
      },
    ]);
  });

  it("прогресс по категориям: непубликованный промежуточный раунд и неопубликованные результаты дают пустые ячейки, не ELIMINATED", async () => {
    divisionFindMany.mockResolvedValue([{ id: "d1", category: { name: "Дебютанты" }, _count: { registrations: 1 } }]);
    roundFindMany.mockResolvedValue([
      { id: "r1", divisionId: "d1", stage: { name: "Четвертьфинал" }, advancementPublishedAt: null, results: [{ registrationId: "regA", status: "ADVANCED" }] },
    ]);
    registrationFindMany.mockResolvedValue([{ id: "regA", divisionId: "d1", role: "LEADER", dancer: { displayName: "Иван" }, checkIn: { bibNumber: "1" } }]);
    // competition.publicResults остаётся false (baseCompetition) — resultFindMany не должен даже понадобиться.

    const view = await getPublicCompetitionView("comp1");
    expect(view!.divisionProgress[0].rows[0].cells.r1).toBeNull();
  });

  it("считает базовую статистику по ролям без судейской аналитики", async () => {
    registrationGroupBy.mockResolvedValue([
      { role: "LEADER", _count: { _all: 6 } },
      { role: "FOLLOWER", _count: { _all: 4 } },
    ]);
    divisionFindMany.mockResolvedValue([{ id: "d1", category: { name: "A" }, _count: { registrations: 10 } }]);
    const view = await getPublicCompetitionView("comp1");
    expect(view!.stats).toEqual({ registrationsCount: 10, leadersCount: 6, followersCount: 4, divisionsCount: 1 });
  });
});
