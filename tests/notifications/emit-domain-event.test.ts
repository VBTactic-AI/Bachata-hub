import { describe, it, expect, vi, beforeEach } from "vitest";

const notificationJobUpsert = vi.fn();
const fakeTx = { notificationJob: { upsert: (...a: unknown[]) => notificationJobUpsert(...a) } };

// after() требует реальный HTTP-контекст запроса Next.js — здесь его нет
// (юнит-тест), поэтому мокаем как no-op: emitDomainEvent() перехватывает
// собственный try/catch на случай, если реальный after() бросает исключение
// вне запроса, но мок гарантирует, что processNotificationJob (реальный,
// с реальным @/lib/prisma) точно не будет вызван внутри этого теста.
const afterMock = vi.fn();
vi.mock("next/server", () => ({ after: (...a: unknown[]) => afterMock(...a) }));

const { emitDomainEvent } = await import("@/server/notifications/emit-domain-event");

beforeEach(() => {
  notificationJobUpsert.mockReset();
  afterMock.mockReset();
});

describe("emitDomainEvent() — только запись NotificationJob, без audience resolution", () => {
  it("пишет job внутри переданной транзакции с точным idempotencyKey", async () => {
    notificationJobUpsert.mockResolvedValue({ id: "job1" });

    await emitDomainEvent(fakeTx as never, {
      type: "EVENT_PUBLISHED",
      payload: { entityId: "event1", eventSlug: "party", title: "Party", date: "20 сентября", cityId: "city1", format: "PARTY" },
      idempotencyKey: "EVENT_PUBLISHED:event1",
    });

    expect(notificationJobUpsert).toHaveBeenCalledWith({
      where: { idempotencyKey: "EVENT_PUBLISHED:event1" },
      create: {
        eventType: "EVENT_PUBLISHED",
        payload: { entityId: "event1", eventSlug: "party", title: "Party", date: "20 сентября", cityId: "city1", format: "PARTY" },
        idempotencyKey: "EVENT_PUBLISHED:event1",
      },
      update: {},
    });
  });

  it("повторный emit с тем же idempotencyKey — update: {} (no-op), не вторая job", async () => {
    notificationJobUpsert.mockResolvedValue({ id: "job1" });

    await emitDomainEvent(fakeTx as never, {
      type: "JNJ_RESULTS_PUBLISHED",
      payload: { entityId: "comp1", competitionName: "J&J Minsk" },
      idempotencyKey: "JNJ_RESULTS_PUBLISHED:comp1",
    });
    await emitDomainEvent(fakeTx as never, {
      type: "JNJ_RESULTS_PUBLISHED",
      payload: { entityId: "comp1", competitionName: "J&J Minsk" },
      idempotencyKey: "JNJ_RESULTS_PUBLISHED:comp1",
    });

    expect(notificationJobUpsert).toHaveBeenCalledTimes(2);
    for (const call of notificationJobUpsert.mock.calls) {
      expect(call[0].update).toEqual({});
    }
  });

  it("неизвестный тип события — бросает ошибку, upsert не вызывается", async () => {
    await expect(
      emitDomainEvent(fakeTx as never, {
        type: "NOT_A_REAL_EVENT" as never,
        payload: {} as never,
        idempotencyKey: "x",
      })
    ).rejects.toThrow();
    expect(notificationJobUpsert).not.toHaveBeenCalled();
  });
});
