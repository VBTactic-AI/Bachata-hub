import { describe, it, expect } from "vitest";
import { eventDraftSchema } from "@/server/events/schemas";

// Events Engine, Stage 1 — EventCertainty (TENTATIVE/CONFIRMED), независимая
// ось от status/moderationStatus. Default CONFIRMED — обратная совместимость
// со старым клиентом (кэш браузера), который ещё не отправляет это поле.
describe("eventDraftSchema — certainty", () => {
  const base = {
    status: "DRAFT" as const,
    format: "PARTY" as const,
  };

  it("по умолчанию CONFIRMED, если поле не передано", () => {
    const result = eventDraftSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.certainty).toBe("CONFIRMED");
  });

  it("принимает явный TENTATIVE", () => {
    const result = eventDraftSchema.safeParse({ ...base, certainty: "TENTATIVE" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.certainty).toBe("TENTATIVE");
  });

  it("отклоняет произвольное значение", () => {
    const result = eventDraftSchema.safeParse({ ...base, certainty: "MAYBE" });
    expect(result.success).toBe(false);
  });

  it("принимает новые форматы таксономии (SOCIAL/OPEN_AIR/PRACTICE/OTHER)", () => {
    for (const format of ["SOCIAL", "OPEN_AIR", "PRACTICE", "OTHER"]) {
      expect(eventDraftSchema.safeParse({ ...base, format }).success).toBe(true);
    }
  });
});

// QA (EVT-26/Test Gap #11, 2026-09-15) — в схеме вообще не было проверки
// endsAt > startsAt, не только теста.
describe("eventDraftSchema — endsAt > startsAt", () => {
  const base = { status: "DRAFT" as const, format: "PARTY" as const };

  it("отклоняет endsAt раньше startsAt", () => {
    const result = eventDraftSchema.safeParse({
      ...base,
      startsAt: "2026-10-17T20:00:00.000Z",
      endsAt: "2026-10-17T18:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });

  it("отклоняет endsAt равный startsAt (нулевая длительность)", () => {
    const result = eventDraftSchema.safeParse({
      ...base,
      startsAt: "2026-10-17T20:00:00.000Z",
      endsAt: "2026-10-17T20:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });

  it("принимает endsAt позже startsAt", () => {
    const result = eventDraftSchema.safeParse({
      ...base,
      startsAt: "2026-10-17T20:00:00.000Z",
      endsAt: "2026-10-17T23:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("без endsAt вообще — валидно (необязательное поле)", () => {
    const result = eventDraftSchema.safeParse({ ...base, startsAt: "2026-10-17T20:00:00.000Z" });
    expect(result.success).toBe(true);
  });
});
