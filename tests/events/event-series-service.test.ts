import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Event, EventSeries, User } from "@prisma/client";

const eventSeriesFindUnique = vi.fn();
const eventSeriesCreate = vi.fn();
const eventSeriesUpdate = vi.fn();
const eventSeriesFindMany = vi.fn();
const eventFindMany = vi.fn();
const eventFindUnique = vi.fn();
const eventUpdate = vi.fn();
const eventTemplateFindUnique = vi.fn();
const schoolFindUnique = vi.fn();

// createSeriesFromEvent оборачивает создание серии + линковку occurrence №1
// в $transaction — fakeTx переиспользует те же create/update моки, что и
// верхнеуровневый prisma (в реальности это разные объекты, но для теста
// важно только то, ЧТО было передано в create/update, не то, через какой
// именно клиент это прошло).
const fakeTx = {
  eventSeries: { create: (...a: unknown[]) => eventSeriesCreate(...a) },
  event: { update: (...a: unknown[]) => eventUpdate(...a) },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    eventSeries: {
      findUnique: (...a: unknown[]) => eventSeriesFindUnique(...a),
      create: (...a: unknown[]) => eventSeriesCreate(...a),
      update: (...a: unknown[]) => eventSeriesUpdate(...a),
      findMany: (...a: unknown[]) => eventSeriesFindMany(...a),
    },
    event: {
      findMany: (...a: unknown[]) => eventFindMany(...a),
      findUnique: (...a: unknown[]) => eventFindUnique(...a),
      update: (...a: unknown[]) => eventUpdate(...a),
    },
    eventTemplate: { findUnique: (...a: unknown[]) => eventTemplateFindUnique(...a) },
    school: { findUnique: (...a: unknown[]) => schoolFindUnique(...a) },
    $transaction: (fn: (tx: typeof fakeTx) => unknown) => fn(fakeTx),
  },
}));

const {
  createSeriesFromEvent,
  updateEventSeries,
  getEventSeries,
  pauseEventSeries,
  resumeEventSeries,
  activateEventSeries,
  archiveEventSeries,
  duplicateEventSeries,
  applySeriesUpdate,
  listSeriesOccurrences,
  EventSeriesForbiddenError,
  EventSeriesNotFoundError,
  EventSeriesValidationError,
} = await import("@/server/events/event-series-service");

const owner = { id: "user_owner", role: "DANCER", isVerifiedEventOrganizer: true } as User;
const stranger = { id: "user_stranger", role: "DANCER", isVerifiedEventOrganizer: false } as User;
const admin = { id: "user_admin", role: "ADMIN" } as User;

function makeSeries(overrides: Partial<EventSeries> = {}): EventSeries {
  return {
    id: "series_1",
    createdById: owner.id,
    schoolId: null,
    organizerName: "Dance Vision",
    templateId: null,
    name: "Bachata Friday",
    description: null,
    format: "PARTY",
    level: "ALL_LEVELS",
    cityId: "city_1",
    venueName: "Dance Vision",
    venueAddress: null,
    timezone: "Europe/Minsk",
    recurrenceRule: { frequency: "WEEKLY", interval: 1, daysOfWeek: [5] },
    defaultStartTime: "21:00",
    defaultEndTime: "02:00",
    startDate: new Date(Date.UTC(2026, 8, 1)),
    endDate: null,
    generationHorizonDays: 84,
    generationThresholdDays: 28,
    autoPublish: false,
    publishDaysBefore: null,
    publishAtTime: null,
    ticketingMode: "UNSET",
    registrationEnabled: false,
    capacity: null,
    priceText: null,
    externalLinkUrl: null,
    tags: [],
    certainty: "CONFIRMED",
    photoUrl: null,
    typeDetails: null,
    status: "ACTIVE",
    lastGeneratedThrough: null,
    lastGeneratedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as EventSeries;
}

function makeSourceEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: "evt_source",
    createdById: owner.id,
    seriesId: null,
    occurrenceDate: null,
    title: "Bachata Friday",
    description: null,
    format: "PARTY",
    level: "ALL_LEVELS",
    schoolId: null,
    organizerName: "Dance Vision",
    cityId: "city_1",
    venueName: "Dance Vision",
    venueAddress: null,
    // 19.09.2026, 21:00 Europe/Minsk (UTC+3) = 18:00Z
    startsAt: new Date("2026-09-19T18:00:00.000Z"),
    endsAt: new Date("2026-09-19T23:00:00.000Z"), // 02:00 след. дня Europe/Minsk
    ticketingMode: "UNSET",
    registrationEnabled: false,
    capacity: null,
    priceText: null,
    externalLinkUrl: null,
    tags: [],
    certainty: "CONFIRMED",
    photoUrl: null,
    ...overrides,
  } as Event;
}

const validRecurrenceInput = {
  recurrenceRule: { frequency: "WEEKLY" as const, interval: 1, daysOfWeek: [5] },
};

beforeEach(() => {
  vi.clearAllMocks();
  eventSeriesUpdate.mockImplementation(async ({ where, data }: { where: { id: string }; data: Partial<EventSeries> }) => ({
    ...makeSeries(),
    ...data,
    id: where.id,
  }));
  eventSeriesCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "series_1", ...data }));
  eventUpdate.mockResolvedValue({});
});

describe("createSeriesFromEvent — RBAC/валидация/вывод дефолтов из Event", () => {
  it("положительный: владелец события делает его регулярным", async () => {
    eventFindUnique.mockResolvedValue(makeSourceEvent());
    const result = await createSeriesFromEvent("evt_source", owner, validRecurrenceInput);
    expect(result.name).toBe("Bachata Friday");
  });

  it("defaultStartTime/defaultEndTime/startDate выводятся из startsAt/endsAt события (Europe/Minsk по умолчанию)", async () => {
    eventFindUnique.mockResolvedValue(makeSourceEvent());
    await createSeriesFromEvent("evt_source", owner, validRecurrenceInput);
    const created = eventSeriesCreate.mock.calls[0][0].data;
    expect(created.defaultStartTime).toBe("21:00");
    expect(created.defaultEndTime).toBe("02:00");
    expect(created.startDate.toISOString()).toBe("2026-09-19T00:00:00.000Z");
  });

  it("событие становится occurrence №1: seriesId/occurrenceDate проставляются тем же occurrenceDate, что и startDate серии", async () => {
    eventFindUnique.mockResolvedValue(makeSourceEvent());
    const series = await createSeriesFromEvent("evt_source", owner, validRecurrenceInput);
    expect(eventUpdate).toHaveBeenCalledWith({
      where: { id: "evt_source" },
      data: { seriesId: series.id, occurrenceDate: new Date("2026-09-19T00:00:00.000Z") },
    });
  });

  it("курсор генератора (lastGeneratedThrough) сразу указывает на дату этого события — не пересоздаётся при следующем тике", async () => {
    eventFindUnique.mockResolvedValue(makeSourceEvent());
    await createSeriesFromEvent("evt_source", owner, validRecurrenceInput);
    const created = eventSeriesCreate.mock.calls[0][0].data;
    expect(created.lastGeneratedThrough.toISOString()).toBe("2026-09-19T00:00:00.000Z");
  });

  it("посторонний (не владелец события) — forbidden", async () => {
    eventFindUnique.mockResolvedValue(makeSourceEvent());
    await expect(createSeriesFromEvent("evt_source", stranger, validRecurrenceInput)).rejects.toThrow(EventSeriesForbiddenError);
    expect(eventSeriesCreate).not.toHaveBeenCalled();
  });

  it("ADMIN может сделать регулярным чужое событие", async () => {
    eventFindUnique.mockResolvedValue(makeSourceEvent());
    await expect(createSeriesFromEvent("evt_source", admin, validRecurrenceInput)).resolves.toBeTruthy();
  });

  it("несуществующее событие — not found", async () => {
    eventFindUnique.mockResolvedValue(null);
    await expect(createSeriesFromEvent("missing", owner, validRecurrenceInput)).rejects.toThrow(EventSeriesNotFoundError);
  });

  it("событие, уже принадлежащее другой серии, отклоняется", async () => {
    eventFindUnique.mockResolvedValue(makeSourceEvent({ seriesId: "series_other", occurrenceDate: new Date() }));
    await expect(createSeriesFromEvent("evt_source", owner, validRecurrenceInput)).rejects.toThrow(EventSeriesValidationError);
  });

  it("формат CONTEST отклоняется явной ошибкой (не тихий пропуск создания Competition)", async () => {
    eventFindUnique.mockResolvedValue(makeSourceEvent({ format: "CONTEST" }));
    await expect(createSeriesFromEvent("evt_source", owner, validRecurrenceInput)).rejects.toThrow(EventSeriesValidationError);
  });

  it("endDate раньше даты события отклоняется", async () => {
    eventFindUnique.mockResolvedValue(makeSourceEvent());
    await expect(createSeriesFromEvent("evt_source", owner, { ...validRecurrenceInput, endDate: "2026-01-01" })).rejects.toThrow(
      EventSeriesValidationError
    );
  });

  it("autoPublish=true без publishDaysBefore/publishAtTime отклоняется", async () => {
    eventFindUnique.mockResolvedValue(makeSourceEvent());
    await expect(
      createSeriesFromEvent("evt_source", owner, { ...validRecurrenceInput, autoPublish: true, publishDaysBefore: null, publishAtTime: null })
    ).rejects.toThrow(EventSeriesValidationError);
  });

  it("некорректный recurrenceRule (WEEKLY без daysOfWeek) отклоняется", async () => {
    eventFindUnique.mockResolvedValue(makeSourceEvent());
    await expect(
      createSeriesFromEvent("evt_source", owner, { recurrenceRule: { frequency: "WEEKLY", interval: 1, daysOfWeek: [] } })
    ).rejects.toThrow();
  });
});

describe("доступ к чужой серии", () => {
  it("владелец видит свою серию", async () => {
    eventSeriesFindUnique.mockResolvedValue(makeSeries());
    await expect(getEventSeries("series_1", owner)).resolves.toBeTruthy();
  });

  it("ADMIN видит любую серию", async () => {
    eventSeriesFindUnique.mockResolvedValue(makeSeries());
    await expect(getEventSeries("series_1", admin)).resolves.toBeTruthy();
  });

  it("посторонний получает forbidden", async () => {
    eventSeriesFindUnique.mockResolvedValue(makeSeries());
    await expect(getEventSeries("series_1", stranger)).rejects.toThrow(EventSeriesForbiddenError);
  });

  it("посторонний не может редактировать (PATCH)", async () => {
    eventSeriesFindUnique.mockResolvedValue(makeSeries());
    await expect(updateEventSeries("series_1", stranger, { name: "Hack" })).rejects.toThrow(EventSeriesForbiddenError);
    expect(eventSeriesUpdate).not.toHaveBeenCalled();
  });

  it("несуществующая серия — not found", async () => {
    eventSeriesFindUnique.mockResolvedValue(null);
    await expect(getEventSeries("missing", owner)).rejects.toThrow(EventSeriesNotFoundError);
  });
});

describe("Pause / Resume (задача §12)", () => {
  it("ACTIVE → PAUSED", async () => {
    eventSeriesFindUnique.mockResolvedValue(makeSeries({ status: "ACTIVE" }));
    const result = await pauseEventSeries("series_1", owner);
    expect(result.status).toBe("PAUSED");
  });

  it("нельзя поставить на паузу уже PAUSED серию (нет валидного перехода)", async () => {
    eventSeriesFindUnique.mockResolvedValue(makeSeries({ status: "PAUSED" }));
    await expect(pauseEventSeries("series_1", owner)).rejects.toThrow(EventSeriesForbiddenError);
  });

  it("PAUSED → ACTIVE (resume)", async () => {
    eventSeriesFindUnique.mockResolvedValue(makeSeries({ status: "PAUSED" }));
    const result = await resumeEventSeries("series_1", owner);
    expect(result.status).toBe("ACTIVE");
  });

  it("нельзя resume уже ACTIVE серию", async () => {
    eventSeriesFindUnique.mockResolvedValue(makeSeries({ status: "ACTIVE" }));
    await expect(resumeEventSeries("series_1", owner)).rejects.toThrow(EventSeriesForbiddenError);
  });

  it("посторонний не может поставить чужую серию на паузу", async () => {
    eventSeriesFindUnique.mockResolvedValue(makeSeries({ status: "ACTIVE" }));
    await expect(pauseEventSeries("series_1", stranger)).rejects.toThrow(EventSeriesForbiddenError);
  });

  it("DRAFT → ACTIVE (activate)", async () => {
    eventSeriesFindUnique.mockResolvedValue(makeSeries({ status: "DRAFT" }));
    const result = await activateEventSeries("series_1", owner);
    expect(result.status).toBe("ACTIVE");
  });
});

describe("Archive (терминально, задача §16)", () => {
  it("любую серию можно архивировать", async () => {
    eventSeriesFindUnique.mockResolvedValue(makeSeries({ status: "ACTIVE" }));
    const result = await archiveEventSeries("series_1", owner);
    expect(result.status).toBe("ARCHIVED");
  });

  it("повторная архивация — идемпотентна", async () => {
    eventSeriesFindUnique.mockResolvedValue(makeSeries({ status: "ARCHIVED" }));
    const result = await archiveEventSeries("series_1", owner);
    expect(result.status).toBe("ARCHIVED");
    expect(eventSeriesUpdate).not.toHaveBeenCalled();
  });

  it("архивную серию нельзя редактировать (PATCH)", async () => {
    eventSeriesFindUnique.mockResolvedValue(makeSeries({ status: "ARCHIVED" }));
    await expect(updateEventSeries("series_1", owner, { name: "X" })).rejects.toThrow(EventSeriesForbiddenError);
  });
});

describe("duplicateEventSeries", () => {
  it("дубликат создаётся как DRAFT (не начинает сразу генерировать)", async () => {
    eventSeriesFindUnique.mockResolvedValue(makeSeries({ status: "ACTIVE" }));
    eventSeriesCreate.mockResolvedValue(makeSeries({ id: "series_2", status: "DRAFT" }));
    const result = await duplicateEventSeries("series_1", owner);
    expect(result.status).toBe("DRAFT");
    expect(eventSeriesCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "DRAFT", createdById: owner.id }) }));
  });
});

describe("applySeriesUpdate — 'это и следующие' / 'вся серия' (задача §9/§10)", () => {
  const future1 = { id: "evt_future_1", occurrenceDate: new Date(Date.UTC(2026, 9, 2)), startsAt: new Date(Date.now() + 7 * 86_400_000) } as Event;
  const future2 = { id: "evt_future_2", occurrenceDate: new Date(Date.UTC(2026, 9, 9)), startsAt: new Date(Date.now() + 14 * 86_400_000) } as Event;

  it("FOLLOWING: обновляет серию и только occurrences с occurrenceDate >= указанной", async () => {
    eventSeriesFindUnique.mockResolvedValue(makeSeries());
    eventFindMany.mockResolvedValue([future2]); // сервис сам передаёт since-фильтр в where — здесь просто то, что БД "вернула бы"
    eventUpdate.mockResolvedValue({});

    const result = await applySeriesUpdate("series_1", owner, { venueName: "New Venue" }, { sinceOccurrenceDate: future2.occurrenceDate! });

    expect(eventFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ seriesId: "series_1", occurrenceDate: { gte: future2.occurrenceDate } }),
      })
    );
    expect(result.occurrencesUpdated).toBe(1);
    expect(eventUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "evt_future_2" }, data: expect.objectContaining({ venueName: "New Venue" }) }));
  });

  it("ALL: не передаёт occurrenceDate-фильтр (применяется ко всем ещё не прошедшим)", async () => {
    eventSeriesFindUnique.mockResolvedValue(makeSeries());
    eventFindMany.mockResolvedValue([future1, future2]);
    eventUpdate.mockResolvedValue({});

    const result = await applySeriesUpdate("series_1", owner, { venueName: "New Venue" });

    const whereArg = eventFindMany.mock.calls[0][0].where;
    expect(whereArg.occurrenceDate).toBeUndefined();
    expect(result.occurrencesUpdated).toBe(2);
  });

  it("никогда не запрашивает уже прошедшие/архивные occurrences (всегда startsAt>now, status!=ARCHIVED)", async () => {
    eventSeriesFindUnique.mockResolvedValue(makeSeries());
    eventFindMany.mockResolvedValue([]);

    await applySeriesUpdate("series_1", owner, { venueName: "New Venue" });

    expect(eventFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: { not: "ARCHIVED" }, startsAt: { gt: expect.any(Date) } }),
      })
    );
  });

  it("изменение времени пересчитывает startsAt/endsAt КАЖДОГО occurrence по ЕГО occurrenceDate", async () => {
    eventSeriesFindUnique.mockResolvedValue(makeSeries());
    eventFindMany.mockResolvedValue([future1]);
    eventUpdate.mockResolvedValue({});

    await applySeriesUpdate("series_1", owner, { defaultStartTime: "22:00" });

    const updateCall = eventUpdate.mock.calls[0][0];
    expect(updateCall.data.startsAt).toBeInstanceOf(Date);
    // 22:00 Europe/Minsk (UTC+3) в день occurrenceDate future1 (2026-10-02) = 19:00 UTC
    expect(updateCall.data.startsAt.toISOString()).toBe("2026-10-02T19:00:00.000Z");
  });

  it("посторонний не может применить правку к чужой серии", async () => {
    eventSeriesFindUnique.mockResolvedValue(makeSeries());
    await expect(applySeriesUpdate("series_1", stranger, { venueName: "Hack" })).rejects.toThrow(EventSeriesForbiddenError);
    expect(eventFindMany).not.toHaveBeenCalled();
  });
});

describe("listSeriesOccurrences — пагинация", () => {
  it("запрашивает limit+1 для определения nextCursor, не грузит всё сразу", async () => {
    eventSeriesFindUnique.mockResolvedValue(makeSeries());
    const items = Array.from({ length: 21 }, (_, i) => ({ id: `evt_${i}` }) as Event);
    eventFindMany.mockResolvedValue(items);

    const result = await listSeriesOccurrences("series_1", owner, { limit: 20 });
    expect(result.items).toHaveLength(20);
    expect(result.nextCursor).toBe("evt_19");
    expect(eventFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 21 }));
  });

  it("посторонний не может получить список occurrences", async () => {
    eventSeriesFindUnique.mockResolvedValue(makeSeries());
    await expect(listSeriesOccurrences("series_1", stranger)).rejects.toThrow(EventSeriesForbiddenError);
  });
});
