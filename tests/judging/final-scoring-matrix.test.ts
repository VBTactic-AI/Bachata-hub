import { describe, it, expect } from "vitest";
import { allowedJudgeRole, countRequiredForJudgeRole, oppositeRole } from "@/server/judging/final-scoring-matrix";

describe("oppositeRole()", () => {
  it("LEADER <-> FOLLOWER", () => {
    expect(oppositeRole("LEADER")).toBe("FOLLOWER");
    expect(oppositeRole("FOLLOWER")).toBe("LEADER");
  });
});

describe("allowedJudgeRole()", () => {
  it("NORMAL/RANDOM_COUPLES — критерий всегда оценивает судья ТОЙ ЖЕ роли, что участник", () => {
    expect(allowedJudgeRole("crit1", "LEADER", "NORMAL", { dancingJudgeCriteriaIds: ["crit1"] })).toBe("LEADER");
    expect(allowedJudgeRole("crit1", "FOLLOWER", "RANDOM_COUPLES", { dancingJudgeCriteriaIds: ["crit1"] })).toBe("FOLLOWER");
  });

  it("JUDGES_DANCE — критерий 'танцующего судьи' оценивает ПРОТИВОПОЛОЖНАЯ роль", () => {
    const config = { dancingJudgeCriteriaIds: ["interaction"] };
    expect(allowedJudgeRole("interaction", "LEADER", "JUDGES_DANCE", config)).toBe("FOLLOWER");
    expect(allowedJudgeRole("interaction", "FOLLOWER", "JUDGES_DANCE", config)).toBe("LEADER");
  });

  it("JUDGES_DANCE — остальные критерии оценивает судья ТОЙ ЖЕ роли (сторонний)", () => {
    const config = { dancingJudgeCriteriaIds: ["interaction"] };
    expect(allowedJudgeRole("technique", "LEADER", "JUDGES_DANCE", config)).toBe("LEADER");
    expect(allowedJudgeRole("technique", "FOLLOWER", "JUDGES_DANCE", config)).toBe("FOLLOWER");
  });

  it("JUDGES_DANCE без config (не задан) — ничего не считается 'танцующим', все критерии по своей роли", () => {
    expect(allowedJudgeRole("interaction", "LEADER", "JUDGES_DANCE", null)).toBe("LEADER");
  });
});

// countRequiredForJudgeRole() — используется и confirmFinalJudgeRoundDone
// (final-scoring.ts), и getFinalScoringProgressInTx (final-advancement.ts),
// см. docs/00_DECISIONS.md, кнопка "Готово" для финала (2026-09-07).
describe("countRequiredForJudgeRole()", () => {
  const criteria = [{ id: "tech" }, { id: "mus" }];

  it("NORMAL — судья своей роли отвечает за все критерии всех участников своей роли", () => {
    const participants = [{ role: "LEADER" as const }, { role: "LEADER" as const }, { role: "FOLLOWER" as const }];
    expect(countRequiredForJudgeRole(participants, criteria, "NORMAL", {}, "LEADER")).toBe(4); // 2 участника × 2 критерия
    expect(countRequiredForJudgeRole(participants, criteria, "NORMAL", {}, "FOLLOWER")).toBe(2); // 1 участник × 2 критерия
  });

  it("роль без участников — 0", () => {
    const participants = [{ role: "LEADER" as const }];
    expect(countRequiredForJudgeRole(participants, criteria, "NORMAL", {}, "FOLLOWER")).toBe(0);
  });

  it("JUDGES_DANCE — критерий 'танцующего судьи' считается за судью ПРОТИВОПОЛОЖНОЙ роли", () => {
    const participants = [{ role: "LEADER" as const }];
    const dancingCriteria = [{ id: "interaction" }, { id: "technique" }];
    const config = { dancingJudgeCriteriaIds: ["interaction"] };
    // Судья-FOLLOWER оценивает "interaction" у LEADER-участника (танцующий) — 1.
    expect(countRequiredForJudgeRole(participants, dancingCriteria, "JUDGES_DANCE", config, "FOLLOWER")).toBe(1);
    // Судья-LEADER (сторонний) оценивает у LEADER-участника только "technique" — 1.
    expect(countRequiredForJudgeRole(participants, dancingCriteria, "JUDGES_DANCE", config, "LEADER")).toBe(1);
  });
});
