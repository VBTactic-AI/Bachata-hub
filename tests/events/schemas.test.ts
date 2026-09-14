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
