import { describe, it, expect } from "vitest";
import { eventDayCount } from "@/lib/format";

// Бейдж многодневности на EventCard (2026-09-19) — фестивали/интенсивы
// показывают "N дней", однодневные события — ничего (null, не 0/1).
// Локальные конструкторы Date (не ISO+"Z") — eventDayCount читает
// календарный день в локальной таймзоне процесса (тот же принцип, что и у
// todayRange() в lib/events.ts), поэтому и тест должен задавать даты так же,
// иначе результат зависел бы от TZ машины, на которой гоняются тесты.
describe("eventDayCount()", () => {
  it("без endsAt — null", () => {
    expect(eventDayCount(new Date(2026, 8, 19, 10), null)).toBeNull();
  });

  it("тот же календарный день — null, даже если endsAt на несколько часов позже", () => {
    expect(eventDayCount(new Date(2026, 8, 19, 10), new Date(2026, 8, 19, 22))).toBeNull();
  });

  it("событие через полночь на следующий день — 2", () => {
    expect(eventDayCount(new Date(2026, 8, 19, 22), new Date(2026, 8, 20, 1))).toBe(2);
  });

  it("трёхдневный фестиваль (22–24 сентября) — 3", () => {
    expect(eventDayCount(new Date(2026, 8, 22, 18), new Date(2026, 8, 24, 23))).toBe(3);
  });
});
