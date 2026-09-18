import { describe, expect, it } from "vitest";
import {
  EVENT_TYPE_REGISTRY,
  FEATURED_EVENT_FORMATS,
  WIZARD_SELECTABLE_EVENT_FORMATS,
  computePublishChecklist,
  isChecklistComplete,
  getEventTypeConfig,
  myEventStatusLabel,
  myEventStatusVariant,
  myEventStatusFilterWhere,
} from "@/lib/events/event-type-registry";

describe("EVENT_TYPE_REGISTRY", () => {
  it("has a config for every EventFormat enum value used by the app", () => {
    for (const format of ["PARTY", "MASTERCLASS", "CONTEST", "FESTIVAL", "INTENSIVE"] as const) {
      const config = getEventTypeConfig(format);
      expect(config.format).toBe(format);
      expect(config.steps.length).toBeGreaterThan(0);
      // Редизайн 2026-09-16 — "type"/"location"/"preview" больше не
      // отдельные шаги (см. комментарий у EventStepId): выбор типа и место
      // проведения теперь внутри "basic", предпросмотр — постоянная боковая
      // панель на каждом шаге, а не отдельный шаг в конце.
      expect(config.steps[0]).toBe("basic");
      expect(config.steps[config.steps.length - 1]).toBe("publish");
    }
  });

  it("features exactly Party/Masterclass as the wizard's first-screen cards", () => {
    expect(FEATURED_EVENT_FORMATS).toEqual(["PARTY", "MASTERCLASS"]);
  });

  // 2026-09-18, по прямому запросу пользователя — конкурс (Jack & Jill) и его
  // Competition теперь заводятся только вместе, одним действием на
  // /admin/competitions/new (см. createCompetition()); общий Event Wizard
  // больше не предлагает формат CONTEST при СОЗДАНИИ нового события (уже
  // существующие CONTEST-события по-прежнему открываются в этом же мастере
  // для правки остальных полей — см. EventTypeSelector.tsx).
  it("excludes CONTEST from the formats selectable in the general Event Wizard", () => {
    expect(WIZARD_SELECTABLE_EVENT_FORMATS).not.toContain("CONTEST");
    expect(WIZARD_SELECTABLE_EVENT_FORMATS).not.toContain("FESTIVAL");
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

// 2026-09-19, по прямому запросу пользователя — прошедшие события авто-
// архивируются по времени (archiveDueEvents(), event-archival.ts) через
// isArchived=true, НЕ через status="ARCHIVED" (та терминальная стадия
// остаётся только за ручной отменой организатора, cancelEvent()). Оба
// случая в "Мои события" должны выглядеть одинаково — организатору без
// разницы, событие отменили руками или оно само прошло по времени.
describe("myEventStatusLabel/Variant/FilterWhere — isArchived (авто-архивация по времени)", () => {
  it("помечает 'В архиве' и по status=ARCHIVED (ручная отмена), и по isArchived=true (авто по времени)", () => {
    expect(myEventStatusLabel("ARCHIVED", "APPROVED")).toBe("В архиве");
    expect(myEventStatusLabel("PUBLISHED", "APPROVED", true)).toBe("В архиве");
    expect(myEventStatusVariant("ARCHIVED", "APPROVED")).toBe("neutral");
    expect(myEventStatusVariant("PUBLISHED", "APPROVED", true)).toBe("neutral");
  });

  it("PUBLISHED+APPROVED без isArchived по-прежнему 'Опубликовано'/success (авто-архивация не трогает status)", () => {
    expect(myEventStatusLabel("PUBLISHED", "APPROVED", false)).toBe("Опубликовано");
    expect(myEventStatusVariant("PUBLISHED", "APPROVED", false)).toBe("success");
  });

  it("фильтр 'ARCHIVED' захватывает оба случая через OR", () => {
    expect(myEventStatusFilterWhere("ARCHIVED")).toEqual({ OR: [{ status: "ARCHIVED" }, { isArchived: true }] });
  });

  it("фильтры 'не архив' (по умолчанию и каждый конкретный статус) дополнительно исключают isArchived=true", () => {
    expect(myEventStatusFilterWhere(undefined)).toMatchObject({ isArchived: false });
    expect(myEventStatusFilterWhere("PUBLISHED")).toMatchObject({ isArchived: false });
    expect(myEventStatusFilterWhere("DRAFT")).toMatchObject({ isArchived: false });
    expect(myEventStatusFilterWhere("PENDING")).toMatchObject({ isArchived: false });
    expect(myEventStatusFilterWhere("REJECTED")).toMatchObject({ isArchived: false });
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
