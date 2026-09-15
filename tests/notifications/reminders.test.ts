import { describe, it, expect, vi, beforeEach } from "vitest";

const notificationPreferenceFindMany = vi.fn();
const eventFindMany = vi.fn();
const transactionMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    notificationPreference: { findMany: (...a: unknown[]) => notificationPreferenceFindMany(...a) },
    event: { findMany: (...a: unknown[]) => eventFindMany(...a) },
    $transaction: (...a: unknown[]) => transactionMock(...a),
  },
}));

const emitDomainEventMock = vi.fn();
vi.mock("@/server/notifications/emit-domain-event", () => ({
  emitDomainEvent: (...a: unknown[]) => emitDomainEventMock(...a),
}));

vi.mock("@/lib/format", () => ({
  formatEventDate: () => "20 сентября",
  formatEventTime: () => "19:00",
}));

const { processDueEventReminders } = await import("@/server/notifications/reminders");

const fakeTx = { fake: "tx" };

beforeEach(() => {
  notificationPreferenceFindMany.mockReset();
  eventFindMany.mockReset();
  transactionMock.mockReset().mockImplementation((cb: (tx: unknown) => unknown) => cb(fakeTx));
  emitDomainEventMock.mockReset();
});

describe("processDueEventReminders() — NOTIF-001", () => {
  it("никто не включил notifyReminders — 0, event.findMany не вызывается вообще", async () => {
    notificationPreferenceFindMany.mockResolvedValue([]);

    const count = await processDueEventReminders();

    expect(count).toBe(0);
    expect(eventFindMany).not.toHaveBeenCalled();
    expect(emitDomainEventMock).not.toHaveBeenCalled();
  });

  it("собирает объединение всех reminderHoursBefore и запрашивает события в окне до max(hours)", async () => {
    notificationPreferenceFindMany.mockResolvedValue([{ reminderHoursBefore: [24, 2] }, { reminderHoursBefore: [48] }]);
    eventFindMany.mockResolvedValue([]);

    await processDueEventReminders();

    expect(eventFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "PUBLISHED",
          moderationStatus: "APPROVED",
          startsAt: expect.objectContaining({ gt: expect.any(Date), lte: expect.any(Date) }),
        }),
      })
    );
  });

  it("игнорирует 0/отрицательные значения reminderHoursBefore (защита от некорректных данных)", async () => {
    notificationPreferenceFindMany.mockResolvedValue([{ reminderHoursBefore: [0, -5] }]);

    const count = await processDueEventReminders();

    expect(count).toBe(0);
    expect(eventFindMany).not.toHaveBeenCalled();
  });

  it("несколько reminderHoursBefore — срабатывает только тот, чей порог уже наступил, остальные ждут своей очереди", async () => {
    notificationPreferenceFindMany.mockResolvedValue([{ reminderHoursBefore: [24, 2] }]);
    // Событие через 10 часов: попадает в окно findMany (<= maxHours=24), порог
    // "24ч до старта" уже пройден (событие ближе, чем 24ч), но порог "2ч до
    // старта" ещё нет (событие дальше, чем 2ч) — должен сработать только
    // hoursBefore=24, hoursBefore=2 подождёт следующего тика sweep.
    const startsAt = new Date(Date.now() + 10 * 3_600_000);
    eventFindMany.mockResolvedValue([
      { id: "event1", slug: "s", title: "t", startsAt, cityId: "city1", format: "PARTY", schoolId: null, createdById: "user1" },
    ]);

    const count = await processDueEventReminders();

    expect(count).toBe(1);
    expect(emitDomainEventMock).toHaveBeenCalledWith(fakeTx, expect.objectContaining({ idempotencyKey: "EVENT_REMINDER:event1:24" }));
    expect(emitDomainEventMock).not.toHaveBeenCalledWith(fakeTx, expect.objectContaining({ idempotencyKey: "EVENT_REMINDER:event1:2" }));
  });

  it("порог наступил — emitDomainEvent вызван с EVENT_REMINDER, правильным payload и идемпотентным ключом", async () => {
    notificationPreferenceFindMany.mockResolvedValue([{ reminderHoursBefore: [24] }]);
    const startsAt = new Date(Date.now() + 1 * 3_600_000); // старт через 1 час — порог "24ч до старта" уже пройден
    eventFindMany.mockResolvedValue([
      { id: "event1", slug: "party-slug", title: "Party", startsAt, cityId: "city1", format: "PARTY", schoolId: "school1", createdById: "user1" },
    ]);

    const count = await processDueEventReminders();

    expect(count).toBe(1);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(emitDomainEventMock).toHaveBeenCalledWith(fakeTx, {
      type: "EVENT_REMINDER",
      payload: {
        entityId: "event1",
        eventSlug: "party-slug",
        title: "Party",
        date: "20 сентября, 19:00",
        cityId: "city1",
        format: "PARTY",
        schoolId: "school1",
        createdById: "user1",
        hoursBefore: 24,
      },
      idempotencyKey: "EVENT_REMINDER:event1:24",
    });
  });

  it("несколько подходящих hoursBefore для одного события — по одному emit на каждую пару (событие, hoursBefore)", async () => {
    notificationPreferenceFindMany.mockResolvedValue([{ reminderHoursBefore: [24, 2] }]);
    const startsAt = new Date(Date.now() + 1 * 3_600_000); // и 24ч, и 2ч-пороги уже пройдены
    eventFindMany.mockResolvedValue([
      { id: "event1", slug: "s", title: "t", startsAt, cityId: "city1", format: "PARTY", schoolId: null, createdById: "user1" },
    ]);

    const count = await processDueEventReminders();

    expect(count).toBe(2);
    expect(emitDomainEventMock).toHaveBeenCalledWith(fakeTx, expect.objectContaining({ idempotencyKey: "EVENT_REMINDER:event1:24" }));
    expect(emitDomainEventMock).toHaveBeenCalledWith(fakeTx, expect.objectContaining({ idempotencyKey: "EVENT_REMINDER:event1:2" }));
  });
});
