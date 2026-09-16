import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Event, EventSeries, School, User } from "@prisma/client";

// Auto Publish Engine (задача §7) — publishDueSeriesOccurrences. Переиспользует
// decidePublishModeration из event-service.ts (не дублирует логику
// auto-approve/REJECTED-re-review, см. комментарий в series-publish.ts).
//
// Публикация считается по computePublishAt(occurrenceDate, daysBefore,
// atTime, timezone) — "за N дней, в HH:mm", не "за N минут до startsAt"
// (уточнено пользователем). Таймзона тестовых кандидатов — "UTC", чтобы не
// приплетать offset-математику в саму проверку published/not-published (она
// уже отдельно покрыта tests/events/recurrence.test.ts).

const eventFindMany = vi.fn();
const txEventUpdate = vi.fn();
const emitDomainEventMock = vi.fn();

const fakeTx = { event: { update: (...a: unknown[]) => txEventUpdate(...a) } };

vi.mock("@/lib/prisma", () => ({
  prisma: {
    event: { findMany: (...a: unknown[]) => eventFindMany(...a) },
    $transaction: (fn: (tx: typeof fakeTx) => unknown) => fn(fakeTx),
  },
}));
vi.mock("@/server/notifications/emit-domain-event", () => ({
  emitDomainEvent: (...a: unknown[]) => emitDomainEventMock(...a),
}));

const { publishDueSeriesOccurrences } = await import("@/server/events/series-publish");

function makeCandidate(overrides: {
  occurrenceDate: Date;
  publishDaysBefore?: number;
  publishAtTime?: string;
  seriesStatus?: EventSeries["status"];
  moderationStatus?: Event["moderationStatus"];
  isVerifiedEventOrganizer?: boolean;
  school?: School | null;
}) {
  return {
    id: "evt_1",
    slug: "bachata-friday-2026-09-19",
    title: "Bachata Friday",
    startsAt: overrides.occurrenceDate,
    occurrenceDate: overrides.occurrenceDate,
    cityId: "city_1",
    format: "PARTY",
    schoolId: null,
    createdById: "user_1",
    status: "DRAFT",
    moderationStatus: overrides.moderationStatus ?? "PENDING",
    series: {
      autoPublish: true,
      status: overrides.seriesStatus ?? "ACTIVE",
      publishDaysBefore: overrides.publishDaysBefore ?? 3,
      publishAtTime: overrides.publishAtTime ?? "10:00",
      timezone: "UTC",
    },
    school: overrides.school ?? null,
    createdBy: { id: "user_1", role: "DANCER", isVerifiedEventOrganizer: overrides.isVerifiedEventOrganizer ?? true } as User,
  } as unknown as Event & { series: EventSeries; school: School | null; createdBy: User };
}

beforeEach(() => {
  vi.clearAllMocks();
  txEventUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "evt_1", slug: "bachata-friday-2026-09-19", title: "Bachata Friday", startsAt: new Date(), cityId: "city_1", format: "PARTY", schoolId: null, createdById: "user_1", ...data }));
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-16T12:00:00.000Z")); // среда, полдень UTC
});

describe("publishDueSeriesOccurrences", () => {
  it("публикует occurrence, когда наступил момент 'за N дней в HH:mm'", async () => {
    // occurrence 19.09 (сб), publishDaysBefore=3 => 16.09 10:00Z — уже прошло (сейчас 12:00Z того же дня).
    const candidate = makeCandidate({ occurrenceDate: new Date("2026-09-19T00:00:00.000Z"), publishDaysBefore: 3, publishAtTime: "10:00" });
    eventFindMany.mockResolvedValue([candidate]);

    const result = await publishDueSeriesOccurrences();
    expect(result.published).toBe(1);
    expect(txEventUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "PUBLISHED" }) }));
    expect(emitDomainEventMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: "EVENT_PUBLISHED" }));
  });

  it("НЕ публикует, если момент 'за N дней в HH:mm' ещё не наступил", async () => {
    // Тот же день (16.09), но время публикации 14:00 — позже текущих 12:00.
    const candidate = makeCandidate({ occurrenceDate: new Date("2026-09-19T00:00:00.000Z"), publishDaysBefore: 3, publishAtTime: "14:00" });
    eventFindMany.mockResolvedValue([candidate]);

    const result = await publishDueSeriesOccurrences();
    expect(result.published).toBe(0);
    expect(txEventUpdate).not.toHaveBeenCalled();
  });

  it("daysBefore=0 — публикует в день самого события, если время уже наступило", async () => {
    const candidate = makeCandidate({ occurrenceDate: new Date("2026-09-16T00:00:00.000Z"), publishDaysBefore: 0, publishAtTime: "09:00" });
    eventFindMany.mockResolvedValue([candidate]);

    const result = await publishDueSeriesOccurrences();
    expect(result.published).toBe(1);
  });

  it("неверифицированный организатор — публикуется в PENDING, без уведомления", async () => {
    const candidate = makeCandidate({ occurrenceDate: new Date("2026-09-16T00:00:00.000Z"), publishDaysBefore: 0, publishAtTime: "00:00", isVerifiedEventOrganizer: false });
    eventFindMany.mockResolvedValue([candidate]);

    const result = await publishDueSeriesOccurrences();
    expect(result.published).toBe(1);
    expect(txEventUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "PUBLISHED", moderationStatus: "PENDING" }) }));
    expect(emitDomainEventMock).not.toHaveBeenCalled();
  });

  it("REJECTED occurrence требует нового review (QA BUG-002) — не auto-approve даже для верифицированного", async () => {
    const candidate = makeCandidate({
      occurrenceDate: new Date("2026-09-16T00:00:00.000Z"),
      publishDaysBefore: 0,
      publishAtTime: "00:00",
      moderationStatus: "REJECTED",
      isVerifiedEventOrganizer: true,
    });
    eventFindMany.mockResolvedValue([candidate]);

    await publishDueSeriesOccurrences();
    expect(txEventUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ moderationStatus: "PENDING" }) }));
    expect(emitDomainEventMock).not.toHaveBeenCalled();
  });

  it("query не включает occurrences серий со статусом PAUSED — фильтр в findMany", async () => {
    eventFindMany.mockResolvedValue([]);
    await publishDueSeriesOccurrences();
    expect(eventFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ series: expect.objectContaining({ status: "ACTIVE" }) }),
      })
    );
  });
});
