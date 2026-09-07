import { describe, it, expect } from "vitest";
import { correctResultSchema, addDivisionSchema } from "@/server/competition/schemas";

// RESULT-001: раньше проверялось только ELIMINATED => placement===null, но
// не обратное — FINALIST с placement:null проходил валидацию, хотя модель
// Result (calculateResults) никогда сама такую комбинацию не создаёт.
describe("correctResultSchema — RESULT-001", () => {
  it("принимает ELIMINATED с placement=null", () => {
    expect(correctResultSchema.safeParse({ status: "ELIMINATED", placement: null, reason: "x" }).success).toBe(true);
  });

  it("принимает FINALIST с реальным местом", () => {
    expect(correctResultSchema.safeParse({ status: "FINALIST", placement: 3, reason: "x" }).success).toBe(true);
  });

  it("отклоняет ELIMINATED с местом", () => {
    expect(correctResultSchema.safeParse({ status: "ELIMINATED", placement: 1, reason: "x" }).success).toBe(false);
  });

  it("отклоняет FINALIST с placement=null", () => {
    expect(correctResultSchema.safeParse({ status: "FINALIST", placement: null, reason: "x" }).success).toBe(false);
  });
});

// judgingMaxScore — метод оценки раундов дивизиона (2026-09-07), задаётся
// один раз при создании (docs/00_DECISIONS.md).
describe("addDivisionSchema — judgingMaxScore", () => {
  const base = { categoryId: "cat1" };

  it("по умолчанию 1 (Да/Нет), если не указано", () => {
    const result = addDivisionSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.judgingMaxScore).toBe(1);
  });

  it("принимает 2 (0/1/2)", () => {
    const result = addDivisionSchema.safeParse({ ...base, judgingMaxScore: 2 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.judgingMaxScore).toBe(2);
  });

  it("отклоняет любое значение кроме 1 и 2", () => {
    expect(addDivisionSchema.safeParse({ ...base, judgingMaxScore: 3 }).success).toBe(false);
    expect(addDivisionSchema.safeParse({ ...base, judgingMaxScore: 0 }).success).toBe(false);
  });
});
