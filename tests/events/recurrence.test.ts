import { describe, it, expect } from "vitest";
import {
  computeOccurrenceDates,
  dateOnlyUtc,
  zonedDateTimeToUtc,
  computeOccurrenceTimes,
  parseTimeString,
  type RecurrenceRule,
} from "@/server/events/recurrence";

// Recurring Events — чистые функции генератора (задача §4-6). Без моков:
// весь модуль детерминирован и не трогает БД/сеть, поэтому тестируется
// напрямую входом/выходом (CLAUDE.md §47 "явные, детерминированные и
// тестируемые алгоритмы").

describe("computeOccurrenceDates — WEEKLY", () => {
  it("каждую пятницу в границах окна", () => {
    const rule: RecurrenceRule = { frequency: "WEEKLY", interval: 1, daysOfWeek: [5] }; // 5 = пятница
    const start = dateOnlyUtc(2026, 9, 1); // вторник
    const window = { from: dateOnlyUtc(2026, 9, 1), to: dateOnlyUtc(2026, 9, 30) };
    const dates = computeOccurrenceDates(rule, start, null, window.from, window.to);
    expect(dates.map((d) => d.toISOString().slice(0, 10))).toEqual(["2026-09-04", "2026-09-11", "2026-09-18", "2026-09-25"]);
  });

  it("несколько дней недели сразу (пн+ср+пт)", () => {
    const rule: RecurrenceRule = { frequency: "WEEKLY", interval: 1, daysOfWeek: [1, 3, 5] };
    const start = dateOnlyUtc(2026, 9, 7); // понедельник
    const dates = computeOccurrenceDates(rule, start, null, start, dateOnlyUtc(2026, 9, 13)); // до воскресенья той же недели
    expect(dates.map((d) => d.getUTCDay())).toEqual([1, 3, 5]);
  });

  it("interval=2 — раз в две недели, опорная неделя от startDate", () => {
    const rule: RecurrenceRule = { frequency: "WEEKLY", interval: 2, daysOfWeek: [5] };
    const start = dateOnlyUtc(2026, 9, 4); // пятница
    const dates = computeOccurrenceDates(rule, start, null, start, dateOnlyUtc(2026, 10, 2));
    expect(dates.map((d) => d.toISOString().slice(0, 10))).toEqual(["2026-09-04", "2026-09-18", "2026-10-02"]);
  });

  it("не выходит за endDate серии, даже если окно шире", () => {
    const rule: RecurrenceRule = { frequency: "WEEKLY", interval: 1, daysOfWeek: [5] };
    const start = dateOnlyUtc(2026, 9, 1);
    const end = dateOnlyUtc(2026, 9, 12);
    const dates = computeOccurrenceDates(rule, start, end, start, dateOnlyUtc(2026, 12, 31));
    expect(dates.map((d) => d.toISOString().slice(0, 10))).toEqual(["2026-09-04", "2026-09-11"]);
  });

  it("окно генерации (windowStart) отсекает уже прошедшие даты правила", () => {
    const rule: RecurrenceRule = { frequency: "WEEKLY", interval: 1, daysOfWeek: [5] };
    const start = dateOnlyUtc(2026, 9, 1);
    const windowStart = dateOnlyUtc(2026, 9, 12); // после первой пятницы
    const dates = computeOccurrenceDates(rule, start, null, windowStart, dateOnlyUtc(2026, 9, 30));
    expect(dates.map((d) => d.toISOString().slice(0, 10))).toEqual(["2026-09-18", "2026-09-25"]);
  });
});

describe("computeOccurrenceDates — DAILY", () => {
  it("каждый день", () => {
    const rule: RecurrenceRule = { frequency: "DAILY", interval: 1 };
    const start = dateOnlyUtc(2026, 9, 1);
    const dates = computeOccurrenceDates(rule, start, null, start, dateOnlyUtc(2026, 9, 5));
    expect(dates).toHaveLength(5);
  });

  it("через день (interval=2)", () => {
    const rule: RecurrenceRule = { frequency: "DAILY", interval: 2 };
    const start = dateOnlyUtc(2026, 9, 1);
    const dates = computeOccurrenceDates(rule, start, null, start, dateOnlyUtc(2026, 9, 7));
    expect(dates.map((d) => d.toISOString().slice(0, 10))).toEqual(["2026-09-01", "2026-09-03", "2026-09-05", "2026-09-07"]);
  });
});

describe("computeOccurrenceDates — MONTHLY", () => {
  it("DAY_OF_MONTH: каждое 15 число", () => {
    const rule: RecurrenceRule = { frequency: "MONTHLY", interval: 1, mode: "DAY_OF_MONTH", dayOfMonth: 15 };
    const start = dateOnlyUtc(2026, 1, 1);
    const dates = computeOccurrenceDates(rule, start, null, start, dateOnlyUtc(2026, 4, 30));
    expect(dates.map((d) => d.toISOString().slice(0, 10))).toEqual(["2026-01-15", "2026-02-15", "2026-03-15", "2026-04-15"]);
  });

  it("DAY_OF_MONTH=31 клампится до последнего дня короткого месяца (без DAY_OF_MONTH=31 никогда не совпал бы в феврале)", () => {
    const rule: RecurrenceRule = { frequency: "MONTHLY", interval: 1, mode: "DAY_OF_MONTH", dayOfMonth: 31 };
    const start = dateOnlyUtc(2026, 1, 1);
    const dates = computeOccurrenceDates(rule, start, null, start, dateOnlyUtc(2026, 2, 28));
    expect(dates.map((d) => d.toISOString().slice(0, 10))).toEqual(["2026-01-31", "2026-02-28"]);
  });

  it("NTH_WEEKDAY: первая пятница месяца", () => {
    const rule: RecurrenceRule = { frequency: "MONTHLY", interval: 1, mode: "NTH_WEEKDAY", weekday: 5, nth: 1 };
    const start = dateOnlyUtc(2026, 1, 1);
    const dates = computeOccurrenceDates(rule, start, null, start, dateOnlyUtc(2026, 3, 31));
    expect(dates.map((d) => d.toISOString().slice(0, 10))).toEqual(["2026-01-02", "2026-02-06", "2026-03-06"]);
  });

  it("NTH_WEEKDAY: последняя пятница месяца (nth=-1)", () => {
    const rule: RecurrenceRule = { frequency: "MONTHLY", interval: 1, mode: "NTH_WEEKDAY", weekday: 5, nth: -1 };
    const start = dateOnlyUtc(2026, 1, 1);
    const dates = computeOccurrenceDates(rule, start, null, start, dateOnlyUtc(2026, 2, 28));
    expect(dates.map((d) => d.toISOString().slice(0, 10))).toEqual(["2026-01-30", "2026-02-27"]);
  });
});

describe("zonedDateTimeToUtc / timezone", () => {
  it("Europe/Minsk (UTC+3, без перевода стрелок) — 21:00 местного это 18:00 UTC", () => {
    const utc = zonedDateTimeToUtc(dateOnlyUtc(2026, 9, 18), "21:00", "Europe/Minsk");
    expect(utc.toISOString()).toBe("2026-09-18T18:00:00.000Z");
  });

  it("America/New_York — учитывает реальный DST-переход (EDT летом, EST зимой)", () => {
    const summer = zonedDateTimeToUtc(dateOnlyUtc(2026, 7, 1), "20:00", "America/New_York"); // EDT = UTC-4
    expect(summer.toISOString()).toBe("2026-07-02T00:00:00.000Z");

    const winter = zonedDateTimeToUtc(dateOnlyUtc(2026, 1, 1), "20:00", "America/New_York"); // EST = UTC-5
    expect(winter.toISOString()).toBe("2026-01-02T01:00:00.000Z");
  });

  it("parseTimeString отклоняет некорректный формат", () => {
    expect(() => parseTimeString("25:99")).toThrow();
    expect(() => parseTimeString("not-a-time")).toThrow();
    expect(parseTimeString("09:05")).toEqual({ hours: 9, minutes: 5 });
  });
});

describe("computeOccurrenceTimes", () => {
  it("21:00–02:00 — окончание переносится на следующий календарный день", () => {
    const { startsAt, endsAt } = computeOccurrenceTimes(dateOnlyUtc(2026, 9, 18), "21:00", "02:00", "Europe/Minsk");
    expect(startsAt.toISOString()).toBe("2026-09-18T18:00:00.000Z");
    expect(endsAt!.toISOString()).toBe("2026-09-18T23:00:00.000Z"); // 02:00 19.09 Minsk = 23:00 18.09 UTC
    expect(endsAt!.getTime()).toBeGreaterThan(startsAt.getTime());
  });

  it("19:00–23:00 — тот же день, не переносится", () => {
    const { startsAt, endsAt } = computeOccurrenceTimes(dateOnlyUtc(2026, 9, 18), "19:00", "23:00", "Europe/Minsk");
    expect(endsAt!.getTime() - startsAt.getTime()).toBe(4 * 3_600_000);
  });

  it("без endTime — endsAt = null", () => {
    const { endsAt } = computeOccurrenceTimes(dateOnlyUtc(2026, 9, 18), "19:00", null, "Europe/Minsk");
    expect(endsAt).toBeNull();
  });
});
