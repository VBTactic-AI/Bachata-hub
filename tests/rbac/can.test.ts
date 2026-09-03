import { describe, it, expect } from "vitest";
import { can } from "@/server/rbac/authorize";
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

describe("can()", () => {
  it("отказывает гостю (actor = null)", () => {
    expect(can(null, "competition:create")).toBe(false);
  });

  it("глобальное право работает без привязки к соревнованию", () => {
    const a = actor({ global: ["competition:create"] });
    expect(can(a, "competition:create")).toBe(true);
  });

  it("право внутри соревнования требует competitionId", () => {
    const a = actor({ byCompetition: { comp1: ["draw:lock"] } });
    expect(can(a, "draw:lock")).toBe(false); // без competitionId — отказ
    expect(can(a, "draw:lock", "comp1")).toBe(true);
  });

  // Критическое требование изоляции (docs/00_DECISIONS.md, B1/D2): роль в
  // одном соревновании не должна давать доступ в другом.
  it("право в одном соревновании НЕ даёт доступа в другом", () => {
    const a = actor({ byCompetition: { comp1: ["draw:lock"] } });
    expect(can(a, "draw:lock", "comp2")).toBe(false);
  });

  it("глобальное право перекрывает отсутствие членства в соревновании", () => {
    const a = actor({ global: ["audit:view"] });
    expect(can(a, "audit:view", "any-competition")).toBe(true);
  });

  it("отсутствие права — отказ, даже если есть другие права", () => {
    const a = actor({ byCompetition: { comp1: ["score:submit"] } });
    expect(can(a, "draw:lock", "comp1")).toBe(false);
  });
});
