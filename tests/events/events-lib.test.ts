import { describe, it, expect } from "vitest";
import { activeEventFilter, isEventDirectlyVisible } from "@/lib/events";

// QA Test Gap #12 — "нет теста, что DRAFT/PENDING/REJECTED события не
// попадают в публичные списки/календарь (код корректен, но негативный тест
// отсутствует)". activeEventFilter() — чистая функция без Prisma-вызовов,
// поэтому тестируется напрямую на форму where-условия, без мока БД.
describe("activeEventFilter()", () => {
  it("требует status=PUBLISHED, moderationStatus=APPROVED, isArchived=false", () => {
    expect(activeEventFilter()).toEqual({
      status: "PUBLISHED",
      moderationStatus: "APPROVED",
      isArchived: false,
    });
  });
});

// QA BUG-007/Test Gap #13 — тот же гейт, что и /events/[slug], теперь
// переиспользуется и для видимости EventProgramItem.linkedEvent.
describe("isEventDirectlyVisible()", () => {
  it("PUBLISHED + APPROVED — видимо", () => {
    expect(isEventDirectlyVisible({ status: "PUBLISHED", moderationStatus: "APPROVED" })).toBe(true);
  });

  it("DRAFT — не видимо, даже если бы moderationStatus был APPROVED", () => {
    expect(isEventDirectlyVisible({ status: "DRAFT", moderationStatus: "APPROVED" })).toBe(false);
  });

  it("PUBLISHED, но PENDING — не видимо (ещё не прошло модерацию)", () => {
    expect(isEventDirectlyVisible({ status: "PUBLISHED", moderationStatus: "PENDING" })).toBe(false);
  });

  it("PUBLISHED, но REJECTED — не видимо", () => {
    expect(isEventDirectlyVisible({ status: "PUBLISHED", moderationStatus: "REJECTED" })).toBe(false);
  });

  it("ARCHIVED — не видимо, даже если модерация была APPROVED в прошлом", () => {
    expect(isEventDirectlyVisible({ status: "ARCHIVED", moderationStatus: "APPROVED" })).toBe(false);
  });
});
