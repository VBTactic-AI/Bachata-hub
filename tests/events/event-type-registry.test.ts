import { describe, expect, it } from "vitest";
import {
  EVENT_TYPE_REGISTRY,
  FEATURED_EVENT_FORMATS,
  computePublishChecklist,
  isChecklistComplete,
  getEventTypeConfig,
} from "@/lib/events/event-type-registry";

describe("EVENT_TYPE_REGISTRY", () => {
  it("has a config for every EventFormat enum value used by the app", () => {
    for (const format of ["PARTY", "MASTERCLASS", "CONTEST", "FESTIVAL", "INTENSIVE"] as const) {
      const config = getEventTypeConfig(format);
      expect(config.format).toBe(format);
      expect(config.steps.length).toBeGreaterThan(0);
      expect(config.steps[0]).toBe("type");
      expect(config.steps[config.steps.length - 1]).toBe("publish");
    }
  });

  it("features exactly Party/Masterclass/Contest as the wizard's first-screen cards", () => {
    expect(FEATURED_EVENT_FORMATS).toEqual(["PARTY", "MASTERCLASS", "CONTEST"]);
  });

  it("gives JNJ (CONTEST) a shorter path — no Categories/Rounds/Judges/Scoring/Final/Rematch steps here, those live in the existing Competition admin", () => {
    const steps = EVENT_TYPE_REGISTRY.CONTEST.steps;
    expect(steps).not.toContain("tickets");
    expect(steps).not.toContain("partyDetails");
    expect(steps).not.toContain("sessions");
  });

  it("gives Masterclass a sessions step (each session carries its own teacher)", () => {
    expect(EVENT_TYPE_REGISTRY.MASTERCLASS.steps).toContain("sessions");
    expect(EVENT_TYPE_REGISTRY.MASTERCLASS.steps).toContain("details");
  });
});

describe("computePublishChecklist", () => {
  it("requires title/city/venue/startsAt for every format", () => {
    const items = computePublishChecklist("PARTY", {});
    expect(items.map((i) => i.id)).toEqual(["title", "city", "venue", "startsAt"]);
    expect(items.every((i) => !i.ok)).toBe(true);
  });

  it("is complete once the baseline fields are filled for PARTY", () => {
    const items = computePublishChecklist("PARTY", {
      title: "Bachata Night",
      cityId: "city-1",
      venueName: "Club X",
      startsAt: "2026-10-01T20:00",
    });
    expect(isChecklistComplete(items)).toBe(true);
  });

  it("additionally requires at least one session AND an instructor for MASTERCLASS", () => {
    const base = { title: "Musicality", cityId: "city-1", venueName: "Studio", startsAt: "2026-10-01T18:00" };

    const noSessions = computePublishChecklist("MASTERCLASS", base);
    expect(isChecklistComplete(noSessions)).toBe(false);
    expect(noSessions.find((i) => i.id === "sessions")?.ok).toBe(false);
    expect(noSessions.find((i) => i.id === "instructor")?.ok).toBe(false);

    const sessionWithoutTeacher = computePublishChecklist("MASTERCLASS", {
      ...base,
      masterclassSessions: [{ teacherId: null }],
    });
    expect(sessionWithoutTeacher.find((i) => i.id === "sessions")?.ok).toBe(true);
    expect(sessionWithoutTeacher.find((i) => i.id === "instructor")?.ok).toBe(false);
    expect(isChecklistComplete(sessionWithoutTeacher)).toBe(false);

    const complete = computePublishChecklist("MASTERCLASS", {
      ...base,
      masterclassSessions: [{ teacherId: null }, { teacherId: "teacher-1" }],
    });
    expect(isChecklistComplete(complete)).toBe(true);
  });

  it("never treats an empty/whitespace title as valid", () => {
    const items = computePublishChecklist("PARTY", { title: "  ", cityId: "c", venueName: "v", startsAt: "2026-01-01T10:00" });
    expect(items.find((i) => i.id === "title")?.ok).toBe(false);
  });
});
