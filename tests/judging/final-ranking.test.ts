import { describe, it, expect } from "vitest";
import {
  rankFinalParticipants,
  rankFinalParticipantsBySkatingSystem,
  resolveTieGroupPlaces,
  type FinalParticipantScores,
  type FinalParticipantPlacements,
} from "@/server/judging/final-ranking";

// Критерии по примеру пользователя (2026-09-04): приоритет — порядок
// разрешения ничьей, НЕ коэффициент. tech=1, musicality=2, interaction=3,
// presentation=4.
const CRITERIA = [
  { id: "tech", priority: 1 },
  { id: "musicality", priority: 2 },
  { id: "interaction", priority: 3 },
  { id: "presentation", priority: 4 },
];

function participant(registrationId: string, tech: number, musicality: number, interaction: number, presentation: number): FinalParticipantScores {
  return { registrationId, role: "LEADER", criteriaTotals: { tech, musicality, interaction, presentation } };
}

describe("rankFinalParticipants", () => {
  // TEST 1 — total равны (370=370), technique выше решает несмотря на то,
  // что interaction ниже.
  it("сравнивает критерий приоритета #1 первым, даже если менее приоритетный критерий выше у другого", () => {
    const a = participant("A", 100, 150, 50, 70); // total 370
    const b = participant("B", 99, 150, 51, 70); // total 370, technique ниже, interaction выше
    const { ranked } = rankFinalParticipants([a, b], CRITERIA);
    expect(ranked.find((r) => r.registrationId === "A")?.place).toBe(1);
    expect(ranked.find((r) => r.registrationId === "B")?.place).toBe(2);
  });

  // TEST 2 — technique равны, решает musicality (приоритет #2).
  it("при равенстве приоритета #1 сравнивает приоритет #2", () => {
    const a = participant("A", 100, 150, 50, 70); // total 370
    const b = participant("B", 100, 149, 51, 70); // total 370, technique равен, musicality ниже
    const { ranked } = rankFinalParticipants([a, b], CRITERIA);
    expect(ranked.find((r) => r.registrationId === "A")?.place).toBe(1);
    expect(ranked.find((r) => r.registrationId === "B")?.place).toBe(2);
  });

  // TEST 3 — полная ничья: total и все критерии равны -> tie group, НЕ
  // автоматическое место (CLAUDE.md §19-20).
  it("полное совпадение total и всех критериев создаёт tie-группу без автоматического места", () => {
    const a = participant("A", 100, 150, 50, 70);
    const b = participant("B", 100, 150, 50, 70);
    const { ranked, tieGroups } = rankFinalParticipants([a, b], CRITERIA);
    expect(ranked.every((r) => r.place === null)).toBe(true);
    expect(ranked.every((r) => r.tieGroupKey === tieGroups[0].key)).toBe(true);
    expect(tieGroups).toHaveLength(1);
    expect(new Set(tieGroups[0].registrationIds)).toEqual(new Set(["A", "B"]));
  });

  // TEST 4 — разный total решает независимо от приоритета критериев.
  it("разный total решает место независимо от критериев приоритета", () => {
    const a = participant("A", 100, 150, 50, 71); // total 371
    const b = participant("B", 100, 150, 50, 70); // total 370
    const { ranked } = rankFinalParticipants([a, b], CRITERIA);
    expect(ranked.find((r) => r.registrationId === "A")?.place).toBe(1);
    expect(ranked.find((r) => r.registrationId === "B")?.place).toBe(2);
  });

  // TEST 5 — несколько независимых tie-групп на разных total НЕ
  // объединяются в одну.
  it("создаёт отдельную tie-группу для каждого уровня total", () => {
    const group370 = [participant("A", 100, 150, 50, 70), participant("B", 100, 150, 50, 70)]; // total 370
    const group360 = [participant("C", 90, 150, 50, 70), participant("D", 90, 150, 50, 70), participant("E", 90, 150, 50, 70)]; // total 360
    const { tieGroups } = rankFinalParticipants([...group370, ...group360], CRITERIA);
    expect(tieGroups).toHaveLength(2);
    const g370 = tieGroups.find((g) => g.registrationIds.includes("A"))!;
    const g360 = tieGroups.find((g) => g.registrationIds.includes("C"))!;
    expect(new Set(g370.registrationIds)).toEqual(new Set(["A", "B"]));
    expect(new Set(g360.registrationIds)).toEqual(new Set(["C", "D", "E"]));
    expect(g370.startPlace).toBe(1);
    expect(g360.startPlace).toBe(3);
  });

  // TEST 6 — приоритет НЕ влияет на саму сумму (никаких весов/умножения).
  it("приоритет критерия не меняет total — сумма всегда простая", () => {
    const a = participant("A", 5, 8, 7, 10); // 5+8+7+10 = 30
    const { ranked } = rankFinalParticipants([a], CRITERIA);
    expect(ranked[0].totalScore).toBe(30);

    const reorderedPriority = [
      { id: "tech", priority: 4 },
      { id: "musicality", priority: 3 },
      { id: "interaction", priority: 2 },
      { id: "presentation", priority: 1 },
    ];
    const { ranked: rankedReordered } = rankFinalParticipants([a], reorderedPriority);
    expect(rankedReordered[0].totalScore).toBe(30);
  });

  it("роли в этом модуле не смешиваются автоматически — вызывающий код передаёт участников одной роли", () => {
    // Чистая функция ничего не знает про роль — просто переносит её в
    // результат как есть; разделение по ролям (подтверждено пользователем,
    // 2026-09-04) — ответственность вызывающего кода (как splitByCutoff в
    // advancement.ts для обычных раундов).
    const a: FinalParticipantScores = { registrationId: "A", role: "FOLLOWER", criteriaTotals: { tech: 10, musicality: 0, interaction: 0, presentation: 0 } };
    const { ranked } = rankFinalParticipants([a], CRITERIA);
    expect(ranked[0].role).toBe("FOLLOWER");
  });
});

describe("resolveTieGroupPlaces", () => {
  it("присваивает места в порядке, начиная со startPlace группы", () => {
    const group = { key: "tie-3-5", startPlace: 3, registrationIds: ["A", "B"] };
    const result = resolveTieGroupPlaces(group, ["B", "A"]);
    expect(result).toEqual([
      { registrationId: "B", place: 3 },
      { registrationId: "A", place: 4 },
    ]);
  });

  it("отклоняет решение, если состав не совпадает с группой", () => {
    const group = { key: "tie-3-5", startPlace: 3, registrationIds: ["A", "B"] };
    expect(() => resolveTieGroupPlaces(group, ["A", "C"])).toThrow();
    expect(() => resolveTieGroupPlaces(group, ["A"])).toThrow();
    expect(() => resolveTieGroupPlaces(group, ["A", "A"])).toThrow();
  });
});

// Relative Placement / скейтинг-система — второй ranking engine (CLAUDE.md
// §18): судьи ставят место напрямую, результат считается majority-алгоритмом,
// НЕ средним и не суммой мест (CLAUDE.md §60 явно запрещает average(мест)).
function placements(registrationId: string, judgePlacements: Record<string, number>): FinalParticipantPlacements {
  return { registrationId, role: "LEADER", judgePlacements };
}

describe("rankFinalParticipantsBySkatingSystem", () => {
  // TEST — учебный пример скейтинг-системы: 3 судьи, 3 участника, у A два
  // первых места (большинство при p=1), поэтому A побеждает, хотя формально
  // не все судьи поставили его первым.
  it("определяет победителя по большинству голосов на минимальном месте", () => {
    const a = placements("A", { j1: 1, j2: 2, j3: 1 });
    const b = placements("B", { j1: 2, j2: 1, j3: 3 });
    const c = placements("C", { j1: 3, j2: 3, j3: 2 });
    const { ranked } = rankFinalParticipantsBySkatingSystem([a, b, c]);
    expect(ranked.find((r) => r.registrationId === "A")?.place).toBe(1);
    expect(ranked.find((r) => r.registrationId === "B")?.place).toBe(2);
    expect(ranked.find((r) => r.registrationId === "C")?.place).toBe(3);
  });

  // TEST — КРИТИЧЕСКИЙ сценарий (CLAUDE.md §60 "не использовать average
  // вместо Relative Placement без разрешения"): классический учебный пример,
  // где простое среднее место дало бы ДРУГОЙ результат, чем настоящий
  // скейтинг. У A три судьи из пяти поставили 1 место (большинство уже на
  // p=1), у B все пять судей стабильно поставили 2 место (большинство только
  // на p=2) — скейтинг отдаёт победу A, хотя средний балл A (2.6) хуже
  // среднего балла B (2.0).
  it("НЕ сводится к простому среднему места — большинство на меньшем уровне выигрывает даже при худшем среднем", () => {
    const a = placements("A", { j1: 1, j2: 1, j3: 1, j4: 5, j5: 5 }); // среднее 2.6
    const b = placements("B", { j1: 2, j2: 2, j3: 2, j4: 2, j5: 2 }); // среднее 2.0
    const naiveAverageA = (1 + 1 + 1 + 5 + 5) / 5;
    const naiveAverageB = (2 + 2 + 2 + 2 + 2) / 5;
    expect(naiveAverageA).toBeGreaterThan(naiveAverageB); // по среднему B был бы "лучше"

    const { ranked } = rankFinalParticipantsBySkatingSystem([a, b]);
    expect(ranked.find((r) => r.registrationId === "A")?.place).toBe(1); // но по скейтингу побеждает A
    expect(ranked.find((r) => r.registrationId === "B")?.place).toBe(2);
  });

  // TEST — полное совпадение расстановок судей (одинаковый уровень
  // разрешения И одинаковая сумма) — настоящая ничья, место не
  // присваивается автоматически (CLAUDE.md §19-20), как и в rankFinalParticipants.
  it("при полном совпадении уровня и суммы создаёт tie-группу без автоматического места", () => {
    const a = placements("A", { j1: 1, j2: 1, j3: 2, j4: 2 });
    const b = placements("B", { j1: 1, j2: 1, j3: 2, j4: 2 });
    const { ranked, tieGroups } = rankFinalParticipantsBySkatingSystem([a, b]);
    expect(ranked.every((r) => r.place === null)).toBe(true);
    expect(tieGroups).toHaveLength(1);
    expect(new Set(tieGroups[0].registrationIds)).toEqual(new Set(["A", "B"]));
  });

  // TEST — при равном уровне разрешения решает "corrected sum" (сумма
  // мест, попавших в порог большинства) — тот же принцип tie-break, что и в
  // критериальном engine, но по сумме МЕСТ, а не баллов. Количество судей в
  // зачёте у обоих одинаковое (2 из 2), поэтому сравнение сразу доходит до
  // суммы — этот тест НЕ проверяет приоритет "количество > сумма" (см. тест
  // ниже).
  it("при равном уровне разрешения И равном количестве судей в зачёте меньшая сумма мест выигрывает", () => {
    // majority = 2 (2 судьи). Оба достигают большинства на p=2.
    const a = placements("A", { j1: 1, j2: 2 }); // сумма при p=2: 1+2=3
    const b = placements("B", { j1: 2, j2: 2 }); // сумма при p=2: 2+2=4
    const { ranked } = rankFinalParticipantsBySkatingSystem([a, b]);
    expect(ranked.find((r) => r.registrationId === "A")?.place).toBe(1);
    expect(ranked.find((r) => r.registrationId === "B")?.place).toBe(2);
  });

  // TEST — РЕГРЕССИЯ (найдено вживую на реальном соревновании, 2026-09-07):
  // при равном уровне разрешения количество судей, попавших в зачёт на этом
  // уровне, ПЕРВИЧНО по отношению к сумме мест. У A все четыре судьи
  // согласны в пределах уровня 2 (сумма 6), у B — только три из четырёх
  // (четвёртый судья дал место 3, вне уровня; сумма в зачёте 4). Меньшая
  // сумма НЕ должна побеждать большинство: A (4 судьи) обязан обойти B (3
  // судьи), несмотря на бóльшую сумму. До фикса алгоритм сравнивал сумму
  // напрямую и отдавал место B — неверно. Участник C добавлен только для
  // корректного n=3 (иначе шкала мест обрезается и сценарий с исключённым
  // голосом невоспроизводим).
  it("при равном уровне разрешения БОЛЬШЕЕ количество судей в зачёте выигрывает, даже при большей сумме", () => {
    const a = placements("A", { j1: 1, j2: 1, j3: 2, j4: 2 }); // level=2, p<=2 у всех четырёх -> count=4, sum=6
    const b = placements("B", { j1: 2, j2: 3, j3: 1, j4: 1 }); // level=2, p<=2 у трёх (j2=3 исключается) -> count=3, sum=4
    const c = placements("C", { j1: 3, j2: 2, j3: 3, j4: 3 }); // заполняет n=3, level=3
    const { ranked } = rankFinalParticipantsBySkatingSystem([a, b, c]);
    expect(ranked.find((r) => r.registrationId === "A")?.place).toBe(1);
    expect(ranked.find((r) => r.registrationId === "B")?.place).toBe(2);
    expect(ranked.find((r) => r.registrationId === "C")?.place).toBe(3);
  });

  // TEST — регрессия на полном реальном протоколе финала (division
  // "Дебютанты", LEADER, 4 судьи, N=6, 2026-09-07): проверяет все шесть
  // мест разом, включая тай-брейк A/B выше внутри полного набора участников
  // (Денисевич/Зеленковский в реальных данных).
  it("воспроизводит реальный протокол финала на 6 участниках (найденная и исправленная регрессия)", () => {
    const fedorov = placements("Федоров", { j1: 1, j2: 1, j3: 2, j4: 1 });
    const denisevich = placements("Денисевич", { j1: 2, j2: 3, j3: 3, j4: 2 });
    const zhulaev = placements("Жулаев", { j1: 5, j2: 6, j3: 6, j4: 4 });
    const zelenkovsky = placements("Зеленковский", { j1: 6, j2: 2, j3: 1, j4: 3 });
    const khlebko = placements("Хлебко", { j1: 4, j2: 5, j3: 5, j4: 6 });
    const endzheychik = placements("Енджейчик", { j1: 3, j2: 4, j3: 4, j4: 5 });

    const { ranked } = rankFinalParticipantsBySkatingSystem([fedorov, denisevich, zhulaev, zelenkovsky, khlebko, endzheychik]);
    const placeOf = (id: string) => ranked.find((r) => r.registrationId === id)?.place;

    expect(placeOf("Федоров")).toBe(1);
    expect(placeOf("Денисевич")).toBe(2);
    expect(placeOf("Зеленковский")).toBe(3);
    expect(placeOf("Енджейчик")).toBe(4);
    expect(placeOf("Хлебко")).toBe(5);
    expect(placeOf("Жулаев")).toBe(6);
  });
});
