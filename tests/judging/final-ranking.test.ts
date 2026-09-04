import { describe, it, expect } from "vitest";
import { rankFinalParticipants, resolveTieGroupPlaces, type FinalParticipantScores } from "@/server/judging/final-ranking";

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
