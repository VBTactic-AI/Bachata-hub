import { describe, it, expect } from "vitest";
import { hasStaffAccessToCompetition } from "@/server/rbac/authorize";
import type { Actor } from "@/server/rbac/actor";

function actor(opts: { global?: string[]; byCompetition?: Record<string, string[]> }): Actor {
  return {
    userId: "u1",
    email: "u1@example.com",
    globalPermissions: new Set(opts.global as never[]),
    permissionsByCompetition: new Map(
      Object.entries(opts.byCompetition ?? {}).map(([k, v]) => [k, new Set(v as never[])])
    ),
  };
}

describe("hasStaffAccessToCompetition() — /admin/competitions[/[id]] (2026-09-14)", () => {
  it("рядовой COMPETITOR в этом соревновании — false (реальный баг, который правим)", () => {
    const a = actor({ byCompetition: { comp1: ["registration:create", "registration:update_own", "checkin:self"] } });
    expect(hasStaffAccessToCompetition(a, "comp1")).toBe(false);
  });

  it("судья в этом соревновании (JUDGE-права) — false, судейский UI — /judging, не /admin", () => {
    const a = actor({ byCompetition: { comp1: ["score:submit", "score:view_own"] } });
    expect(hasStaffAccessToCompetition(a, "comp1")).toBe(false);
  });

  it("вообще без членства в этом соревновании — false", () => {
    const a = actor({ byCompetition: { comp2: ["round:create"] } });
    expect(hasStaffAccessToCompetition(a, "comp1")).toBe(false);
  });

  it("штатное назначение (round:create) в этом соревновании — true", () => {
    const a = actor({ byCompetition: { comp1: ["round:create"] } });
    expect(hasStaffAccessToCompetition(a, "comp1")).toBe(true);
  });

  it("COMPETITOR в comp1, но EVENT_ADMIN в comp2 — доступ только к comp2", () => {
    const a = actor({ byCompetition: { comp1: ["registration:create"], comp2: ["competition:update"] } });
    expect(hasStaffAccessToCompetition(a, "comp1")).toBe(false);
    expect(hasStaffAccessToCompetition(a, "comp2")).toBe(true);
  });

  it("глобальное право (SUPER_ADMIN-мост) — true для ЛЮБОГО competitionId, даже без единого членства", () => {
    const a = actor({ global: ["competition:create"] });
    expect(hasStaffAccessToCompetition(a, "any-comp")).toBe(true);
  });
});
