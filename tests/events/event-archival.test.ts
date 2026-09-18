import { describe, it, expect, vi, beforeEach } from "vitest";

const updateMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { event: { updateMany: (...a: unknown[]) => updateMany(...a) } },
}));

const { archiveDueEvents } = await import("@/server/events/event-archival");

beforeEach(() => {
  updateMany.mockReset().mockResolvedValue({ count: 0 });
});

// 2026-09-19, по прямому запросу пользователя — "событие после даты должно
// сниматься с публикации и переходить в архив". Реализовано через
// isArchived=true (см. докстроку archiveDueEvents()), НЕ через
// status="ARCHIVED" — та терминальная стадия остаётся только за ручной
// отменой организатора (cancelEvent()), а прямая ссылка на прошедшее событие
// должна продолжать открываться всем (isEventDirectlyVisible в lib/events.ts
// сознательно игнорирует isArchived).
describe("archiveDueEvents()", () => {
  it("отбирает только PUBLISHED+APPROVED+ещё не заархивированные события", async () => {
    await archiveDueEvents();

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "PUBLISHED", moderationStatus: "APPROVED", isArchived: false }),
        data: { isArchived: true },
      })
    );
  });

  it("считает событие прошедшим по endsAt, если оно заполнено, иначе по startsAt (тот же критерий, что и syncNoShowForEvent)", async () => {
    await archiveDueEvents();

    const call = updateMany.mock.calls[0][0];
    expect(call.where.OR).toEqual([{ endsAt: { lt: expect.any(Date) } }, { endsAt: null, startsAt: { lt: expect.any(Date) } }]);
  });

  it("возвращает количество заархивированных событий", async () => {
    updateMany.mockResolvedValue({ count: 3 });
    const result = await archiveDueEvents();
    expect(result).toEqual({ archived: 3 });
  });
});
