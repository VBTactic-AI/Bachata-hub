import { describe, it, expect } from "vitest";
import { hasNoAdminAccess } from "@/server/rbac/authorize";
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

describe("hasNoAdminAccess()", () => {
  it("актёр вообще без прав (незалогиненный/не назначен никуда) — true, доступа нет (сам баг, который правим)", () => {
    const a = actor({});
    expect(hasNoAdminAccess(a)).toBe(true);
  });

  it("судья без других ролей — true", () => {
    const a = actor({ byCompetition: { comp1: ["score:submit", "score:view_own", "judge:ranking_submit", "judge:conflict_declare"] } });
    expect(hasNoAdminAccess(a)).toBe(true);
  });

  it("судья с частичным набором судейских прав — тоже true (подмножество)", () => {
    const a = actor({ byCompetition: { comp1: ["score:submit"] } });
    expect(hasNoAdminAccess(a)).toBe(true);
  });

  it("рядовой зарегистрированный участник (роль COMPETITOR) — true, доступа нет (сам баг, который правим)", () => {
    const a = actor({ byCompetition: { comp1: ["registration:create", "registration:update_own", "checkin:self"] } });
    expect(hasNoAdminAccess(a)).toBe(true);
  });

  it("участник в одном соревновании + судья в другом — всё ещё true (обе роли рядовые)", () => {
    const a = actor({ byCompetition: { comp1: ["registration:create"], comp2: ["score:submit"] } });
    expect(hasNoAdminAccess(a)).toBe(true);
  });

  it("судья, который где-то ещё EVENT_ADMIN (напр. round:create) — false", () => {
    const a = actor({ byCompetition: { comp1: ["score:submit"], comp2: ["round:create"] } });
    expect(hasNoAdminAccess(a)).toBe(false);
  });

  it("любое глобальное право (SUPER_ADMIN-мост) — false, даже если по соревнованиям только рядовые", () => {
    const a = actor({ global: ["competition:create"], byCompetition: { comp1: ["score:submit"] } });
    expect(hasNoAdminAccess(a)).toBe(false);
  });

  it("SCORER (score:view_all не входит ни в судейский, ни в участнический набор) — false", () => {
    const a = actor({ byCompetition: { comp1: ["score:view_all", "result:calculate"] } });
    expect(hasNoAdminAccess(a)).toBe(false);
  });

  it("DJ/MC-подобные права (напр. timer:control) — false", () => {
    const a = actor({ byCompetition: { comp1: ["timer:control"] } });
    expect(hasNoAdminAccess(a)).toBe(false);
  });
});
