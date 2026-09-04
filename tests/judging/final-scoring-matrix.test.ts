import { describe, it, expect } from "vitest";
import { allowedJudgeRole, oppositeRole } from "@/server/judging/final-scoring-matrix";

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
