import { describe, it, expect } from "vitest";
import { isJudgeOnlyActor } from "@/server/rbac/authorize";
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

describe("isJudgeOnlyActor()", () => {
  it("судья без других ролей — true", () => {
    const a = actor({ byCompetition: { comp1: ["score:submit", "score:view_own", "judge:ranking_submit", "judge:conflict_declare"] } });
    expect(isJudgeOnlyActor(a)).toBe(true);
  });

  it("судья с частичным набором прав JUDGE (не всеми) — тоже true (подмножество)", () => {
    const a = actor({ byCompetition: { comp1: ["score:submit"] } });
    expect(isJudgeOnlyActor(a)).toBe(true);
  });

  it("судья на нескольких соревнованиях сразу — true", () => {
    const a = actor({ byCompetition: { comp1: ["score:submit"], comp2: ["judge:conflict_declare"] } });
    expect(isJudgeOnlyActor(a)).toBe(true);
  });

  it("актёр вообще без прав (гость/не назначен никуда) — false, не судья", () => {
    const a = actor({});
    expect(isJudgeOnlyActor(a)).toBe(false);
  });

  it("судья, который где-то ещё HEAD_JUDGE/EVENT_ADMIN — false", () => {
    const a = actor({ byCompetition: { comp1: ["score:submit"], comp2: ["round:create"] } });
    expect(isJudgeOnlyActor(a)).toBe(false);
  });

  it("любое глобальное право (SUPER_ADMIN-мост) — false, даже если по соревнованиям только судейские", () => {
    const a = actor({ global: ["competition:create"], byCompetition: { comp1: ["score:submit"] } });
    expect(isJudgeOnlyActor(a)).toBe(false);
  });

  it("SCORER (score:view_all не входит в набор JUDGE) — false", () => {
    const a = actor({ byCompetition: { comp1: ["score:view_all", "result:calculate"] } });
    expect(isJudgeOnlyActor(a)).toBe(false);
  });
});
