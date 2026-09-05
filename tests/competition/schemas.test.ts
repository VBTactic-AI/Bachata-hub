import { describe, it, expect } from "vitest";
import { correctResultSchema } from "@/server/competition/schemas";

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
