import { describe, it, expect } from "vitest";
import { isCheckInPhaseOver, isNoShow } from "@/server/competition/no-show";

describe("isCheckInPhaseOver()", () => {
  it("фаза check-in ещё не закрыта в DRAFT/REGISTRATION_OPEN/REGISTRATION_CLOSED/CHECK_IN", () => {
    for (const status of ["DRAFT", "REGISTRATION_OPEN", "REGISTRATION_CLOSED", "CHECK_IN"] as const) {
      expect(isCheckInPhaseOver(status)).toBe(false);
    }
  });

  it("фаза check-in закрыта в READY и далее", () => {
    for (const status of ["READY", "LIVE", "SCORING", "REVIEW", "PUBLISHED", "ARCHIVED"] as const) {
      expect(isCheckInPhaseOver(status)).toBe(true);
    }
  });
});

describe("isNoShow()", () => {
  it("REGISTERED без check-in после закрытия фазы check-in — неявка", () => {
    expect(isNoShow({ registrationStatus: "REGISTERED", hasCheckIn: false, competitionStatus: "LIVE" })).toBe(true);
  });

  it("REGISTERED без check-in, пока фаза check-in ещё идёт — НЕ неявка (ещё не подошёл)", () => {
    expect(isNoShow({ registrationStatus: "REGISTERED", hasCheckIn: false, competitionStatus: "CHECK_IN" })).toBe(false);
  });

  it("есть check-in — не неявка, даже после закрытия фазы", () => {
    expect(isNoShow({ registrationStatus: "REGISTERED", hasCheckIn: true, competitionStatus: "LIVE" })).toBe(false);
  });

  it("SCRATCHED — не неявка, даже без check-in (явное решение, не про явку)", () => {
    expect(isNoShow({ registrationStatus: "SCRATCHED", hasCheckIn: false, competitionStatus: "LIVE" })).toBe(false);
  });

  it("DISQUALIFIED — не неявка, даже без check-in", () => {
    expect(isNoShow({ registrationStatus: "DISQUALIFIED", hasCheckIn: false, competitionStatus: "LIVE" })).toBe(false);
  });
});
