import { describe, it, expect } from "vitest";
import {
  buildMonitorHref,
  heatProgressLabel,
  findFloorSpotlight,
  collectPendingTieBreaks,
  collectOtherActiveCategories,
  collectNextUpItems,
  type OverviewDivision,
  type OverviewRound,
  type OverviewHeat,
  type OverviewParticipant,
  type ScoringProgress,
} from "@/lib/competition-overview";

// Вкладка "Главная" — только чтение уже принятых сервером решений
// (round.status/type, DrawParticipant.scored), поэтому тесты здесь проверяют
// извлечение и приоритизацию, а не пересчёт scoring/advancement/tie-break —
// та бизнес-логика уже покрыта своими тестами (tests/judging/**).

function participant(role: "LEADER" | "FOLLOWER", bib: number, scored = true): OverviewParticipant {
  return { registrationId: `r-${bib}`, role, scored, bibNumber: String(bib), displayName: `Танцор №${bib}` };
}

function heat(id: string, number: number, status: OverviewHeat["status"], participants: OverviewParticipant[] = []): OverviewHeat {
  return { id, number, status, participants };
}

function round(overrides: Partial<OverviewRound> & { id: string }): OverviewRound {
  return {
    type: null,
    status: "READY",
    order: 1,
    stageLabel: "1/4 финала",
    judgingFormatLabel: "Да/Нет",
    finalistsCount: null,
    advancementPublishedAt: null,
    config: null,
    finalFormat: null,
    heats: [],
    ...overrides,
  };
}

function division(overrides: Partial<OverviewDivision> & { id: string; categoryName: string }): OverviewDivision {
  return { categoryColor: "#3b82f6", leaderJudgesCount: 2, followerJudgesCount: 2, rounds: [], ...overrides };
}

describe("buildMonitorHref", () => {
  it("собирает ссылку на вкладку Монитора с категорией/раундом/заходом", () => {
    expect(buildMonitorHref("comp1", { divisionId: "div1", roundId: "round1", heatId: "heat1" })).toBe(
      "/admin/competitions/comp1?tab=monitor&category=div1&round=round1&heat=heat1"
    );
  });

  it("без раунда/захода собирает только категорию", () => {
    expect(buildMonitorHref("comp1", { divisionId: "div1" })).toBe("/admin/competitions/comp1?tab=monitor&category=div1");
  });
});

describe("heatProgressLabel", () => {
  it("показывает первый ещё не завершённый заход", () => {
    expect(heatProgressLabel([heat("h1", 1, "FINISHED"), heat("h2", 2, "RUNNING"), heat("h3", 3, "PENDING")])).toBe("Заход 2 из 3");
  });

  it("когда всё завершено — показывает последний, а не первый", () => {
    expect(heatProgressLabel([heat("h1", 1, "FINISHED"), heat("h2", 2, "FINISHED")])).toBe("Заход 2 из 2");
  });

  it("на пустом раунде — прочерк", () => {
    expect(heatProgressLabel([])).toBe("—");
  });
});

describe("findFloorSpotlight", () => {
  it("находит заход, который сейчас реально танцуется (RUNNING)", () => {
    const divisions: OverviewDivision[] = [
      division({
        id: "novice",
        categoryName: "Novice",
        rounds: [round({ id: "r-novice", heats: [heat("h1", 1, "FINISHED"), heat("h2", 2, "PENDING")] })],
      }),
      division({
        id: "intermediate",
        categoryName: "Intermediate",
        rounds: [
          round({
            id: "r-inter",
            heats: [
              heat("hi1", 1, "FINISHED"),
              heat("hi2", 2, "RUNNING", [participant("LEADER", 201), participant("FOLLOWER", 202), participant("LEADER", 900, false)]),
            ],
          }),
        ],
      }),
    ];

    const spotlight = findFloorSpotlight("comp1", divisions, new Map());
    expect(spotlight?.categoryName).toBe("Intermediate");
    expect(spotlight?.heatNumber).toBe(2);
    expect(spotlight?.heatsTotal).toBe(2);
    // Помощник (scored=false) не входит в список танцующих — он не в зачёт (CLAUDE.md §16).
    expect(spotlight?.leaders).toEqual([{ bibNumber: "201", displayName: "Танцор №201" }]);
    expect(spotlight?.followers).toEqual([{ bibNumber: "202", displayName: "Танцор №202" }]);
  });

  // JUDGES_DANCE (запрос пользователя, 2026-09-11): Heat.number в БД сквозной
  // на весь раунд (заход 1 = стадия партнёров, заход 2 = стадия партнёрш) —
  // на экране должно показываться "Заход 1" заново для каждой роли, а не
  // унаследованный от БД глобальный номер.
  it("JUDGES_DANCE: номер захода на экране считается заново с 1 для роли, которая сейчас танцует", () => {
    const divisions: OverviewDivision[] = [
      division({
        id: "profi",
        categoryName: "Профи",
        rounds: [
          round({
            id: "r-final",
            finalFormat: "JUDGES_DANCE",
            heats: [
              heat("h1", 1, "FINISHED", [participant("LEADER", 10), participant("LEADER", 11)]),
              heat("h2", 2, "RUNNING", [participant("FOLLOWER", 20), participant("FOLLOWER", 21)]),
            ],
          }),
        ],
      }),
    ];

    const spotlight = findFloorSpotlight("comp1", divisions, new Map());
    // Заход h2 — второй по Heat.number в БД, но первый (и единственный) заход
    // стадии партнёрш — на экране должен быть "Заход 1 из 1", не "2 из 2".
    expect(spotlight?.heatNumber).toBe(1);
    expect(spotlight?.heatsTotal).toBe(1);
  });

  it("если никто не танцует — на паркете никого", () => {
    const divisions: OverviewDivision[] = [
      division({ id: "novice", categoryName: "Novice", rounds: [round({ id: "r1", heats: [heat("h1", 1, "PENDING")] })] }),
    ];
    expect(findFloorSpotlight("comp1", divisions, new Map())).toBeNull();
  });

  it("пауза на паркете тоже считается спотлайтом", () => {
    const divisions: OverviewDivision[] = [
      division({
        id: "novice",
        categoryName: "Novice",
        rounds: [round({ id: "r1", heats: [heat("h1", 1, "PAUSED", [participant("LEADER", 5)])] })],
      }),
    ];
    expect(findFloorSpotlight("comp1", divisions, new Map())?.heatStatusLabel).toBe("Пауза");
  });

  it("во время подсчёта баллов подставляет реальный прогресс, а не выдуманный", () => {
    const divisions: OverviewDivision[] = [
      division({
        id: "adv",
        categoryName: "Advanced",
        rounds: [round({ id: "r-adv", status: "SCORING", heats: [heat("h1", 1, "RUNNING")] })],
      }),
    ];
    const progress = new Map<string, ScoringProgress>([["r-adv", { submitted: 3, required: 6 }]]);
    expect(findFloorSpotlight("comp1", divisions, progress)?.scoring).toEqual({ submitted: 3, required: 6 });
  });
});

describe("collectPendingTieBreaks — CLAUDE.md §20: 10 мест, 9–11 позиции равны", () => {
  it("не выбирает проходящих сама — отдаёт всех троих кандидатов и число свободных мест", () => {
    const divisions: OverviewDivision[] = [
      division({
        id: "proam",
        categoryName: "Pro-Am",
        rounds: [
          round({
            id: "r-tb",
            type: "TIE_BREAK",
            status: "SCORING",
            finalistsCount: 2, // 3 претендента на 2 оставшихся места (9-11 при cutoff=10)
            heats: [heat("h-tb", 1, "FINISHED", [participant("LEADER", 118), participant("LEADER", 124), participant("LEADER", 131)])],
          }),
        ],
      }),
    ];

    const rows = collectPendingTieBreaks("comp1", divisions);
    expect(rows).toHaveLength(1);
    expect(rows[0].candidates.map((c) => c.bibNumber)).toEqual(["118", "124", "131"]);
    expect(rows[0].freeSlots).toBe(2);
    expect(rows[0].kind).toBe("SELECT_N");
  });

  it("финальный tie-break (finalTieGroupKey) — без числа свободных мест, это про места, не про отсев", () => {
    const divisions: OverviewDivision[] = [
      division({
        id: "final-div",
        categoryName: "Advanced",
        rounds: [
          round({
            id: "r-final-tb",
            type: "TIE_BREAK",
            status: "SCORING",
            config: { finalTieGroupKey: "g1" },
            heats: [heat("h1", 1, "FINISHED", [participant("LEADER", 1), participant("LEADER", 2)])],
          }),
        ],
      }),
    ];
    const rows = collectPendingTieBreaks("comp1", divisions);
    expect(rows[0].kind).toBe("FINAL");
    expect(rows[0].freeSlots).toBeNull();
  });

  it("обычный незавершённый раунд (не tie-break) — не попадает в список", () => {
    const divisions: OverviewDivision[] = [
      division({ id: "d1", categoryName: "Novice", rounds: [round({ id: "r1", status: "SCORING" })] }),
    ];
    expect(collectPendingTieBreaks("comp1", divisions)).toHaveLength(0);
  });
});

describe("collectOtherActiveCategories", () => {
  it("не дублирует категорию, уже показанную в спотлайте на паркете", () => {
    const divisions: OverviewDivision[] = [
      division({ id: "on-floor", categoryName: "Intermediate", rounds: [round({ id: "r-floor", status: "RUNNING" })] }),
      division({ id: "elsewhere", categoryName: "Advanced", rounds: [round({ id: "r-adv", status: "SCORING" })] }),
    ];
    const rows = collectOtherActiveCategories("comp1", divisions, new Map(), "r-floor");
    expect(rows.map((r) => r.categoryName)).toEqual(["Advanced"]);
  });

  it("ожидающий tie-break показывает как отдельный статус", () => {
    const divisions: OverviewDivision[] = [
      division({
        id: "proam",
        categoryName: "Pro-Am",
        rounds: [round({ id: "r-tb", type: "TIE_BREAK", status: "SCORING" })],
      }),
    ];
    const rows = collectOtherActiveCategories("comp1", divisions, new Map(), null);
    expect(rows[0].statusVariant).toBe("red");
    expect(rows[0].statusLabel).toBe("Tie-Break");
  });

  it("раунд в покое (DRAFT/READY/COMPLETED) не считается активным", () => {
    const divisions: OverviewDivision[] = [
      division({ id: "d1", categoryName: "Newcomer", rounds: [round({ id: "r1", status: "COMPLETED" })] }),
    ];
    expect(collectOtherActiveCategories("comp1", divisions, new Map(), null)).toHaveLength(0);
  });
});

describe("collectNextUpItems", () => {
  it("tie-break всегда приоритет p1 — выше незакрытого судейства", () => {
    const divisions: OverviewDivision[] = [
      division({
        id: "adv",
        categoryName: "Advanced",
        rounds: [round({ id: "r-adv", status: "SCORING" })],
      }),
      division({
        id: "proam",
        categoryName: "Pro-Am",
        rounds: [round({ id: "r-tb", type: "TIE_BREAK", status: "SCORING", finalistsCount: 2, heats: [heat("h1", 1, "FINISHED", [participant("LEADER", 1)])] })],
      }),
    ];
    const progress = new Map<string, ScoringProgress>([["r-adv", { submitted: 3, required: 6 }]]);
    const items = collectNextUpItems("comp1", divisions, progress, true);

    expect(items[0].priority).toBe("p1");
    expect(items[0].title).toContain("Pro-Am");
    expect(items.some((i) => i.title.includes("Advanced"))).toBe(true);
  });

  it("полностью собранные оценки не попадают в 'дособрать'", () => {
    const divisions: OverviewDivision[] = [
      division({ id: "d1", categoryName: "Novice", rounds: [round({ id: "r1", status: "SCORING" })] }),
    ];
    const progress = new Map<string, ScoringProgress>([["r1", { submitted: 6, required: 6 }]]);
    expect(collectNextUpItems("comp1", divisions, progress, true)).toHaveLength(0);
  });

  it("публикацию результатов предлагает только тем, у кого есть право result:publish", () => {
    const divisions: OverviewDivision[] = [
      division({
        id: "d1",
        categoryName: "Newcomer",
        rounds: [
          round({ id: "r-prelim", type: null, order: 1, status: "COMPLETED" }),
          round({ id: "r-final", type: null, order: 2, status: "COMPLETED" }),
        ],
      }),
    ];
    // r-prelim не финальный (после него есть r-final) и ещё не опубликован — кандидат на публикацию.
    // r-final — финальный раунд дивизиона, публикация результатов для него не через этот пункт (см. CompetitionResultsPanel).
    expect(collectNextUpItems("comp1", divisions, new Map(), true).map((i) => i.title)).toEqual(["Опубликовать результаты — Newcomer"]);
    expect(collectNextUpItems("comp1", divisions, new Map(), false)).toHaveLength(0);
  });

  it("уже опубликованный раунд не предлагается повторно", () => {
    const divisions: OverviewDivision[] = [
      division({
        id: "d1",
        categoryName: "Newcomer",
        rounds: [
          round({ id: "r-prelim", type: null, order: 1, status: "COMPLETED", advancementPublishedAt: new Date("2026-09-09") }),
          round({ id: "r-final", type: null, order: 2, status: "COMPLETED" }),
        ],
      }),
    ];
    expect(collectNextUpItems("comp1", divisions, new Map(), true)).toHaveLength(0);
  });
});
