import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";
import type { EventSeries } from "@prisma/client";

// Generation Engine (задача §6/§8) — generateSeriesOccurrences/
// generateDueSeriesOccurrences. Мокаем prisma целиком (по образцу остальных
// tests/events/*), т.к. реальная идемпотентность гарантируется unique-
// индексом в БД (миграция 20260916110000) — здесь проверяем, что КОД
// корректно реагирует на P2002 (гонка cron), а не что constraint существует.

const eventFindMany = vi.fn();
const eventFindUnique = vi.fn().mockResolvedValue(null); // uniqueSlug() — слаг всегда свободен в тестах
const eventCreate = vi.fn();
const eventSeriesUpdate = vi.fn();
const eventSeriesUpdateMany = vi.fn().mockResolvedValue({ count: 0 });
const eventSeriesFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    event: {
      findMany: (...a: unknown[]) => eventFindMany(...a),
      findUnique: (...a: unknown[]) => eventFindUnique(...a),
      create: (...a: unknown[]) => eventCreate(...a),
    },
    eventSeries: {
      update: (...a: unknown[]) => eventSeriesUpdate(...a),
      updateMany: (...a: unknown[]) => eventSeriesUpdateMany(...a),
      findMany: (...a: unknown[]) => eventSeriesFindMany(...a),
    },
  },
}));

const { generateSeriesOccurrences, generateDueSeriesOccurrences } = await import("@/server/events/series-generation");

function makeSeries(overrides: Partial<EventSeries> = {}): EventSeries {
  return {
    id: "series_1",
    createdById: "user_1",
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
  } as unknown as EventSeries;
}

beforeEach(() => {
  vi.clearAllMocks();
  eventFindUnique.mockResolvedValue(null);
  eventSeriesUpdateMany.mockResolvedValue({ count: 0 });
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-01T00:00:00.000Z")); // вторник
});

describe("generateSeriesOccurrences", () => {
  it("первый запуск: создаёт все пятницы в пределах горизонта (12 недель)", async () => {
    eventFindMany.mockResolvedValue([]); // ничего ещё не сгенерировано
    eventCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: `evt_${data.occurrenceDate}`, ...data }));

    const result = await generateSeriesOccurrences(makeSeries());

    expect(result.created).toBe(12); // 12 недель горизонта => 12 пятниц
    expect(eventSeriesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "series_1" }, data: expect.objectContaining({ lastGeneratedThrough: expect.any(Date) }) })
    );
  });

  it("не генерирует, если серия PAUSED", async () => {
    const result = await generateSeriesOccurrences(makeSeries({ status: "PAUSED" }));
    expect(result.created).toBe(0);
    expect(eventCreate).not.toHaveBeenCalled();
  });

  it("не генерирует, если серия ARCHIVED", async () => {
    const result = await generateSeriesOccurrences(makeSeries({ status: "ARCHIVED" }));
    expect(result.created).toBe(0);
    expect(eventCreate).not.toHaveBeenCalled();
  });

  it("не генерирует, если ещё не наступил порог (lastGeneratedThrough далеко впереди)", async () => {
    const series = makeSeries({ lastGeneratedThrough: new Date(Date.UTC(2026, 11, 1)) }); // сильно за порогом (4 недели)
    const result = await generateSeriesOccurrences(series);
    expect(result.created).toBe(0);
    expect(eventCreate).not.toHaveBeenCalled();
  });

  it("НЕ создаёт дубликат: уже существующая occurrenceDate пропускается без попытки create", async () => {
    eventFindMany.mockResolvedValue([{ occurrenceDate: new Date(Date.UTC(2026, 8, 4)) }]); // 4 сент уже есть
    eventCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "evt", ...data }));

    const result = await generateSeriesOccurrences(makeSeries());
    expect(result.created).toBe(11); // 12 пятниц минус уже существующую
    const createdDates = eventCreate.mock.calls.map((c) => (c[0].data.occurrenceDate as Date).toISOString());
    expect(createdDates).not.toContain(new Date(Date.UTC(2026, 8, 4)).toISOString());
  });

  it("гонка двух тиков cron: P2002 на create не считается ошибкой и не увеличивает created", async () => {
    eventFindMany.mockResolvedValue([]);
    eventCreate.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "5.18.0" })
    );
    eventCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "evt", ...data }));

    const result = await generateSeriesOccurrences(makeSeries());
    expect(result.created).toBe(11); // 12 попыток, первая "проиграла гонку", не посчитана
  });

  it("повторный запуск (тот же lastGeneratedThrough уже за порогом) — идемпотентен, ничего не создаёт", async () => {
    // Первый прогон уже продвинул курсор до конца горизонта.
    const horizonEnd = new Date(Date.UTC(2026, 10, 24)); // 84 дня от 2026-09-01
    const series = makeSeries({ lastGeneratedThrough: horizonEnd });
    const result = await generateSeriesOccurrences(series);
    expect(result.created).toBe(0);
    expect(eventCreate).not.toHaveBeenCalled();
  });

  it("cancelled (ARCHIVED) occurrence всё равно занимает свой слот — не пересоздаётся", async () => {
    // findMany без фильтра по status — архивная occurrenceDate тоже "существующая".
    eventFindMany.mockResolvedValue([{ occurrenceDate: new Date(Date.UTC(2026, 8, 4)) }]);
    eventCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "evt", ...data }));

    await generateSeriesOccurrences(makeSeries());
    const createdDates = eventCreate.mock.calls.map((c) => (c[0].data.occurrenceDate as Date).getTime());
    expect(createdDates).not.toContain(new Date(Date.UTC(2026, 8, 4)).getTime());
  });
});

describe("generateDueSeriesOccurrences", () => {
  it("переводит серии с истёкшим endDate в ENDED и не запрашивает их дальше", async () => {
    eventSeriesUpdateMany.mockResolvedValue({ count: 2 });
    eventSeriesFindMany.mockResolvedValue([]);

    const result = await generateDueSeriesOccurrences();
    expect(result.ended).toBe(2);
    expect(eventSeriesUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: { in: ["ACTIVE", "PAUSED"] } }), data: { status: "ENDED" } })
    );
  });

  it("обрабатывает несколько ACTIVE серий пакетно и суммирует created", async () => {
    eventSeriesFindMany.mockResolvedValue([makeSeries({ id: "s1" }), makeSeries({ id: "s2" })]);
    eventFindMany.mockResolvedValue([]);
    eventCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "evt", ...data }));

    const result = await generateDueSeriesOccurrences();
    expect(result.seriesProcessed).toBe(2);
    expect(result.occurrencesCreated).toBe(24); // 12 + 12
  });
});
