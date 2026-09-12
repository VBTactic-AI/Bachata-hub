import { describe, it, expect } from "vitest";
import { engineRoleCodeRequiresMfa, siteRoleRequiresMfa } from "@/server/mfa/policy";

describe("src/server/mfa/policy.ts", () => {
  it("SUPER_ADMIN и EVENT_ADMIN требуют MFA", () => {
    expect(engineRoleCodeRequiresMfa("SUPER_ADMIN")).toBe(true);
    expect(engineRoleCodeRequiresMfa("EVENT_ADMIN")).toBe(true);
  });

  it("HEAD_JUDGE/JUDGE/SCORER/DJ/MC/COMPETITOR — MFA не обязательна (сужено по прямому указанию пользователя)", () => {
    for (const code of ["HEAD_JUDGE", "JUDGE", "SCORER", "DJ", "MC", "COMPETITOR"]) {
      expect(engineRoleCodeRequiresMfa(code)).toBe(false);
    }
  });

  it("сайтовый ADMIN (мост D2 на SUPER_ADMIN) требует MFA, остальные роли слоя 1 — нет", () => {
    expect(siteRoleRequiresMfa("ADMIN")).toBe(true);
    expect(siteRoleRequiresMfa("MODERATOR")).toBe(false);
    expect(siteRoleRequiresMfa("DANCER")).toBe(false);
    expect(siteRoleRequiresMfa("SCHOOL_REP")).toBe(false);
    expect(siteRoleRequiresMfa("ORGANIZER")).toBe(false);
  });
});
