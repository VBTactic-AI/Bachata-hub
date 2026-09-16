import { z } from "zod";

// Recurring Events — структурированное правило повторения (задача §4: "не
// хранить recurrence только в виде свободного текста"). Дискриминированный
// union вместо RRULE-строки/библиотеки (CLAUDE.md §14 — не добавляй
// зависимость без необходимости; весь набор нужных операций укладывается в
// ~100 строк чистых функций ниже, тестируемых напрямую).

export const WEEKLY_INTERVAL_MAX = 52;
export const MONTHLY_INTERVAL_MAX = 24;
export const DAILY_INTERVAL_MAX = 365;

// weekday: 0=воскресенье..6=суббота — совпадает с нативным Date.getUTCDay(),
// сознательно НЕ ISO (пн=1), чтобы не заводить отдельную конвертацию на
// каждом шаге генератора (см. computeOccurrenceDates ниже).
const weekdaySchema = z.number().int().min(0).max(6);

const dailyRuleSchema = z.object({
  frequency: z.literal("DAILY"),
  interval: z.number().int().min(1).max(DAILY_INTERVAL_MAX).default(1),
});
const weeklyRuleSchema = z.object({
  frequency: z.literal("WEEKLY"),
  interval: z.number().int().min(1).max(WEEKLY_INTERVAL_MAX).default(1),
  daysOfWeek: z.array(weekdaySchema).min(1),
});
// MONTHLY — вложенный discriminatedUnion по mode: верхний z.discriminatedUnion
// требует УНИКАЛЬНОГО значения "frequency" на каждую ветку, а тут их две
// ("MONTHLY" + DAY_OF_MONTH/NTH_WEEKDAY) — поэтому сначала различаем mode,
// потом всю группу подключаем через z.union к остальным двум частотам.
const monthlyRuleSchema = z.discriminatedUnion("mode", [
  z.object({
    frequency: z.literal("MONTHLY"),
    interval: z.number().int().min(1).max(MONTHLY_INTERVAL_MAX).default(1),
    mode: z.literal("DAY_OF_MONTH"),
    dayOfMonth: z.number().int().min(1).max(31),
  }),
  z.object({
    frequency: z.literal("MONTHLY"),
    interval: z.number().int().min(1).max(MONTHLY_INTERVAL_MAX).default(1),
    mode: z.literal("NTH_WEEKDAY"),
    weekday: weekdaySchema,
    // 1..4 = первый..четвёртый такой день месяца, -1 = последний (например
    // "последняя пятница месяца") — тот же приём, что и в большинстве
    // календарных систем (Google/Outlook RRULE BYSETPOS).
    nth: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(-1)]),
  }),
]);

export const recurrenceRuleSchema = z.union([dailyRuleSchema, weeklyRuleSchema, monthlyRuleSchema]);

export type RecurrenceRule = z.infer<typeof recurrenceRuleSchema>;

// ---------------------------------------------------------------------------
// Календарные даты — работаем с "гражданским" (Y,M,D) без времени суток, все
// сравнения через UTC-полночь (стабильны, не зависят от TZ процесса).
// ---------------------------------------------------------------------------

export function dateOnlyUtc(year: number, month1to12: number, day: number): Date {
  return new Date(Date.UTC(year, month1to12 - 1, day));
}

export function addDaysUtc(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

export function diffDaysUtc(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

function daysInMonth(year: number, month1to12: number): number {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
}

function monthIndex(date: Date): number {
  return date.getUTCFullYear() * 12 + date.getUTCMonth();
}

function nthWeekdayOfMonth(date: Date): number {
  return Math.floor((date.getUTCDate() - 1) / 7) + 1;
}

function isLastWeekdayOfMonth(date: Date): boolean {
  return date.getUTCDate() + 7 > daysInMonth(date.getUTCFullYear(), date.getUTCMonth() + 1);
}

function matchesRule(date: Date, rule: RecurrenceRule, startDate: Date): boolean {
  if (date.getTime() < startDate.getTime()) return false;

  switch (rule.frequency) {
    case "DAILY": {
      const diff = diffDaysUtc(date, startDate);
      return diff % rule.interval === 0;
    }
    case "WEEKLY": {
      if (!rule.daysOfWeek.includes(date.getUTCDay())) return false;
      // Индекс недели считаем от начала недели (воскресенье) стартовой даты,
      // а не от самой startDate — иначе interval>1 давал бы разные "опорные"
      // недели в зависимости от того, каким днём недели была startDate.
      const startWeekStart = addDaysUtc(startDate, -startDate.getUTCDay());
      const dateWeekStart = addDaysUtc(date, -date.getUTCDay());
      const weekIndex = diffDaysUtc(dateWeekStart, startWeekStart) / 7;
      return weekIndex % rule.interval === 0;
    }
    case "MONTHLY": {
      const diff = monthIndex(date) - monthIndex(startDate);
      if (diff < 0 || diff % rule.interval !== 0) return false;
      if (rule.mode === "DAY_OF_MONTH") {
        const clampedDay = Math.min(rule.dayOfMonth, daysInMonth(date.getUTCFullYear(), date.getUTCMonth() + 1));
        return date.getUTCDate() === clampedDay;
      }
      // NTH_WEEKDAY
      if (date.getUTCDay() !== rule.weekday) return false;
      return rule.nth === -1 ? isLastWeekdayOfMonth(date) : nthWeekdayOfMonth(date) === rule.nth;
    }
  }
}

// Чистая функция генератора — все календарные даты (UTC-полночь), где
// правило совпадает, внутри [windowStart, windowEnd] (включительно), с
// учётом границ самой серии (startDate/endDate). День за днём — окно всегда
// ограничено generationHorizonDays (по умолчанию 84 дня), поэтому
// производительность не является проблемой (CLAUDE.md §54 — не усложнять
// ради гипотетического масштаба).
export function computeOccurrenceDates(
  rule: RecurrenceRule,
  startDate: Date,
  endDate: Date | null,
  windowStart: Date,
  windowEnd: Date
): Date[] {
  const from = windowStart.getTime() > startDate.getTime() ? windowStart : startDate;
  const to = endDate && endDate.getTime() < windowEnd.getTime() ? endDate : windowEnd;
  if (from.getTime() > to.getTime()) return [];

  const dates: Date[] = [];
  for (let d = from; d.getTime() <= to.getTime(); d = addDaysUtc(d, 1)) {
    if (matchesRule(d, rule, startDate)) dates.push(d);
  }
  return dates;
}

// ---------------------------------------------------------------------------
// IANA timezone → UTC-инстант, без внешней зависимости (Node/Next имеют
// полные данные ICU "из коробки", Intl.DateTimeFormat — официальный API, не
// самодельная криптография/дата-математика). Стандартный two-pass приём
// (тот же, что использует date-fns-tz внутри): угадываем UTC-момент так,
// будто заданное "настенное" время и есть UTC, затем узнаём, каким
// настенным временем в целевой зоне ОН реально является, и на разницу
// (offset) поправляем угадку. Одной итерации недостаточно на границе
// перевода стрелок, двух хватает для любой реальной таймзоны.
// ---------------------------------------------------------------------------

function getOffsetMinutes(utcMillis: number, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(new Date(utcMillis));
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const asUtc = Date.UTC(+map.year, +map.month - 1, +map.day, +map.hour, +map.minute, +map.second);
  // local(zone) = utc + offset  =>  offset = local(zone) - utc
  return (asUtc - utcMillis) / 60_000;
}

// "HH:mm" → часы/минуты, кидает при неверном формате (нельзя молча принять
// мусор — это время, из которого строится публично видимая дата события).
export function parseTimeString(value: string): { hours: number; minutes: number } {
  const m = /^([0-1]?\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!m) throw new Error(`Некорректный формат времени: "${value}", ожидается "HH:mm"`);
  return { hours: Number(m[1]), minutes: Number(m[2]) };
}

// Собирает конкретный UTC Date из календарной даты (UTC-полночь), "HH:mm" и
// IANA-таймзоны серии.
export function zonedDateTimeToUtc(calendarDate: Date, time: string, timeZone: string): Date {
  const { hours, minutes } = parseTimeString(time);
  const y = calendarDate.getUTCFullYear();
  const mo = calendarDate.getUTCMonth();
  const d = calendarDate.getUTCDate();

  let guess = Date.UTC(y, mo, d, hours, minutes);
  for (let i = 0; i < 2; i++) {
    const offset = getOffsetMinutes(guess, timeZone);
    guess = Date.UTC(y, mo, d, hours, minutes) - offset * 60_000;
  }
  return new Date(guess);
}

// startsAt/endsAt конкретного occurrence из его "слота" (calendarDate) и
// времён серии. Если конец раньше начала ("21:00–02:00", задача §13) — конец
// автоматически на следующий календарный день.
export function computeOccurrenceTimes(
  calendarDate: Date,
  startTime: string,
  endTime: string | null,
  timeZone: string
): { startsAt: Date; endsAt: Date | null } {
  const startsAt = zonedDateTimeToUtc(calendarDate, startTime, timeZone);
  if (!endTime) return { startsAt, endsAt: null };

  const start = parseTimeString(startTime);
  const end = parseTimeString(endTime);
  const rollsPastMidnight = end.hours * 60 + end.minutes <= start.hours * 60 + start.minutes;
  const endCalendarDate = rollsPastMidnight ? addDaysUtc(calendarDate, 1) : calendarDate;
  const endsAt = zonedDateTimeToUtc(endCalendarDate, endTime, timeZone);
  return { startsAt, endsAt };
}

// Обратное направление — UTC-инстант → "гражданские" год/месяц/день/час/минута
// в заданной таймзоне. Нужно, чтобы завести серию ИЗ уже созданного Event
// (задача "Event Creation Engine — регулярность как опция публикации"):
// Event.startsAt уже UTC-инстант, а Series.startDate/defaultStartTime нужны
// как календарная дата и "HH:mm" в таймзоне серии.
export function zonedDateParts(date: Date, timeZone: string): { year: number; month: number; day: number; hours: number; minutes: number } {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) map[p.type] = p.value;
  return { year: +map.year, month: +map.month, day: +map.day, hours: +map.hour, minutes: +map.minute };
}

export function formatHhMm(hours: number, minutes: number): string {
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

// Auto Publish (задача §7, уточнено пользователем) — момент публикации
// считается как "за N дней ДО КАЛЕНДАРНОЙ ДАТЫ occurrence, в конкретное
// время", а не "за N минут до startsAt" — иначе при позднем времени начала
// события (21:00) публикация "за 3 дня" сдвинулась бы на 21:00, а не на
// удобное утро. daysBefore=0 — публиковать в день самого события.
export function computePublishAt(occurrenceDate: Date, daysBefore: number, atTime: string, timeZone: string): Date {
  const publishCalendarDate = addDaysUtc(occurrenceDate, -daysBefore);
  return zonedDateTimeToUtc(publishCalendarDate, atTime, timeZone);
}
