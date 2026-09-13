import { describe, it, expect, vi, beforeEach } from "vitest";

const notificationJobFindUnique = vi.fn();
const notificationJobFindMany = vi.fn();
const notificationJobUpdate = vi.fn();
const notificationCreateMany = vi.fn();
const notificationFindMany = vi.fn();
const notificationDeliveryCreateMany = vi.fn();
const notificationDeliveryFindMany = vi.fn();
const notificationDeliveryFindUnique = vi.fn();
const notificationDeliveryUpdate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    notificationJob: {
      findUnique: (...a: unknown[]) => notificationJobFindUnique(...a),
      findMany: (...a: unknown[]) => notificationJobFindMany(...a),
      update: (...a: unknown[]) => notificationJobUpdate(...a),
    },
    notification: {
      createMany: (...a: unknown[]) => notificationCreateMany(...a),
      findMany: (...a: unknown[]) => notificationFindMany(...a),
    },
    notificationDelivery: {
      createMany: (...a: unknown[]) => notificationDeliveryCreateMany(...a),
      findMany: (...a: unknown[]) => notificationDeliveryFindMany(...a),
      findUnique: (...a: unknown[]) => notificationDeliveryFindUnique(...a),
      update: (...a: unknown[]) => notificationDeliveryUpdate(...a),
    },
  },
}));

const resolveAudienceUserIdsMock = vi.fn();
vi.mock("@/server/notifications/audience-resolver", () => ({
  resolveAudienceUserIds: (...a: unknown[]) => resolveAudienceUserIdsMock(...a),
}));

const getPreferenceMapMock = vi.fn();
vi.mock("@/server/notifications/preferences", () => ({
  getPreferenceMap: (...a: unknown[]) => getPreferenceMapMock(...a),
}));

const getActiveTemplateMock = vi.fn();
vi.mock("@/server/notifications/templates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/notifications/templates")>();
  return { ...actual, getActiveTemplate: (...a: unknown[]) => getActiveTemplateMock(...a) };
});

// Provider registry (Phase 5) — только EMAIL зарегистрирован в тестах,
// чтобы отдельно проверить и "канал с провайдером", и "канал без провайдера
// (TELEGRAM) остаётся PENDING, не ошибка".
const providerSendMock = vi.fn();
vi.mock("@/server/notifications/providers/registry", () => ({
  PROVIDER_REGISTRY: { EMAIL: { channel: "EMAIL", send: (...a: unknown[]) => providerSendMock(...a) } },
}));

const { processNotificationJob, processDueNotificationJobs, processDueDeliveries, computeNextRetryAt, retryDeliveryNow, DeliveryNotFoundError } =
  await import("@/server/notifications/process-job");

const DEFAULT_PREF = {
  eventFormatsEnabled: ["PARTY", "MASTERCLASS", "FESTIVAL", "CONTEST", "INTENSIVE"],
  notifyReminders: true,
  reminderHoursBefore: [24, 2],
  notifyChanges: true,
  notifyCancellations: true,
  channelsEnabled: ["IN_APP"],
  emailFrequency: "IMMEDIATE",
};

beforeEach(() => {
  notificationJobFindUnique.mockReset();
  notificationJobFindMany.mockReset();
  notificationJobUpdate.mockReset().mockResolvedValue({});
  notificationCreateMany.mockReset().mockResolvedValue({ count: 0 });
  notificationFindMany.mockReset().mockResolvedValue([]);
  notificationDeliveryCreateMany.mockReset().mockResolvedValue({ count: 0 });
  notificationDeliveryFindMany.mockReset().mockResolvedValue([]);
  notificationDeliveryFindUnique.mockReset().mockResolvedValue(null);
  notificationDeliveryUpdate.mockReset().mockResolvedValue({});
  resolveAudienceUserIdsMock.mockReset();
  getPreferenceMapMock.mockReset();
  getActiveTemplateMock.mockReset();
  providerSendMock.mockReset().mockResolvedValue({ status: "SENT" });
});

describe("computeNextRetryAt() — экспоненциальный backoff, не бесконечный retry", () => {
  it("30с / 2мин / 10мин на попытки 1-3", () => {
    const now = Date.now();
    expect(computeNextRetryAt(1)!.getTime() - now).toBeCloseTo(30_000, -2);
    expect(computeNextRetryAt(2)!.getTime() - now).toBeCloseTo(120_000, -2);
    expect(computeNextRetryAt(3)!.getTime() - now).toBeCloseTo(600_000, -2);
  });

  it("после 3 попыток — null (попытки исчерпаны, не ретраить бесконечно)", () => {
    expect(computeNextRetryAt(4)).toBeNull();
  });
});

describe("processNotificationJob() — уже DONE", () => {
  it("no-op, ни одного дальнейшего запроса", async () => {
    notificationJobFindUnique.mockResolvedValue({ id: "job1", status: "DONE" });

    await processNotificationJob("job1");

    expect(notificationJobUpdate).not.toHaveBeenCalled();
    expect(resolveAudienceUserIdsMock).not.toHaveBeenCalled();
  });

  it("job не найден — no-op", async () => {
    notificationJobFindUnique.mockResolvedValue(null);

    await processNotificationJob("ghost");

    expect(notificationJobUpdate).not.toHaveBeenCalled();
  });
});

describe("processNotificationJob() — RESOLVE-событие (рассылка по подписке)", () => {
  const job = {
    id: "job1",
    status: "PENDING",
    attemptCount: 0,
    eventType: "EVENT_PUBLISHED",
    payload: { entityId: "event1", eventSlug: "party", title: "Party", date: "20 сентября", cityId: "city1", format: "MASTERCLASS" },
  };

  it("отфильтровывает по NotificationPreference.eventFormatsEnabled и создаёт Notification только прошедшим фильтр", async () => {
    notificationJobFindUnique.mockResolvedValue(job);
    resolveAudienceUserIdsMock.mockResolvedValue(["u1", "u2"]);
    getPreferenceMapMock
      .mockResolvedValueOnce(
        new Map([
          ["u1", DEFAULT_PREF], // подписан на MASTERCLASS — пройдёт
          ["u2", { ...DEFAULT_PREF, eventFormatsEnabled: ["PARTY"] }], // не подписан на MASTERCLASS — отфильтрован
        ])
      )
      .mockResolvedValueOnce(new Map([["u1", DEFAULT_PREF]]));
    getActiveTemplateMock.mockResolvedValue({
      titleTemplate: "Новое событие",
      bodyTemplate: "{{title}} — {{date}}",
      deepLinkTemplate: "/events/{{eventSlug}}",
    });
    notificationFindMany.mockResolvedValue([{ id: "notif1", userId: "u1" }]);

    await processNotificationJob("job1");

    expect(notificationCreateMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          userId: "u1",
          type: "EVENT_PUBLISHED",
          title: "Новое событие",
          body: "Party — 20 сентября",
          deepLink: "/events/party",
          entityId: "event1",
          idempotencyKey: "EVENT_PUBLISHED:job1:u1",
        }),
      ],
      skipDuplicates: true,
    });
    expect(notificationJobUpdate).toHaveBeenCalledWith({
      where: { id: "job1" },
      data: { status: "DONE", nextRetryAt: null },
    });
  });

  it("никто не прошёл фильтр — Notification не создаётся, job всё равно DONE", async () => {
    notificationJobFindUnique.mockResolvedValue(job);
    resolveAudienceUserIdsMock.mockResolvedValue(["u1"]);
    getPreferenceMapMock.mockResolvedValue(new Map([["u1", { ...DEFAULT_PREF, eventFormatsEnabled: ["PARTY"] }]]));

    await processNotificationJob("job1");

    expect(notificationCreateMany).not.toHaveBeenCalled();
    expect(notificationJobUpdate).toHaveBeenCalledWith({ where: { id: "job1" }, data: { status: "DONE", nextRetryAt: null } });
  });

  it("нет кандидатов вообще — Audience Resolver вернул [], preference не запрашивается", async () => {
    notificationJobFindUnique.mockResolvedValue(job);
    resolveAudienceUserIdsMock.mockResolvedValue([]);

    await processNotificationJob("job1");

    expect(getPreferenceMapMock).not.toHaveBeenCalled();
    expect(notificationCreateMany).not.toHaveBeenCalled();
  });

  it("создаёт NotificationDelivery по каналам из предпочтений получателя, сразу помечает IN_APP DELIVERED и вызывает провайдер EMAIL", async () => {
    notificationJobFindUnique.mockResolvedValue(job);
    resolveAudienceUserIdsMock.mockResolvedValue(["u1"]);
    getPreferenceMapMock
      .mockResolvedValueOnce(new Map([["u1", DEFAULT_PREF]]))
      .mockResolvedValueOnce(new Map([["u1", { ...DEFAULT_PREF, channelsEnabled: ["IN_APP", "EMAIL"] }]]));
    getActiveTemplateMock.mockResolvedValue({ titleTemplate: "t", bodyTemplate: "b", deepLinkTemplate: null });
    notificationFindMany.mockResolvedValue([{ id: "notif1", userId: "u1" }]);
    notificationDeliveryFindMany.mockResolvedValue([
      { id: "del1", channel: "IN_APP", notificationId: "notif1" },
      { id: "del2", channel: "EMAIL", notificationId: "notif1" },
    ]);
    notificationDeliveryFindUnique.mockResolvedValue({ id: "del2", attemptCount: 0, status: "PENDING" });
    providerSendMock.mockResolvedValue({ status: "SENT", providerMessageId: "resend-1" });

    await processNotificationJob("job1");

    expect(notificationDeliveryCreateMany).toHaveBeenCalledWith({
      data: [
        { notificationId: "notif1", channel: "IN_APP" },
        { notificationId: "notif1", channel: "EMAIL" },
      ],
      skipDuplicates: true,
    });
    // IN_APP — прямой update по id, без внешнего вызова
    expect(notificationDeliveryUpdate).toHaveBeenCalledWith({
      where: { id: "del1" },
      data: expect.objectContaining({ status: "DELIVERED" }),
    });
    // EMAIL — реальный вызов провайдера с уже отрендеренным текстом
    expect(providerSendMock).toHaveBeenCalledWith({ userId: "u1", title: "t", body: "b", deepLink: null });
    expect(notificationDeliveryUpdate).toHaveBeenCalledWith({
      where: { id: "del2" },
      data: expect.objectContaining({ status: "SENT", providerMessageId: "resend-1" }),
    });
  });

  it("провайдер вернул FAILED — статус FAILED, nextRetryAt посчитан, errorMessage сохранён", async () => {
    notificationJobFindUnique.mockResolvedValue(job);
    resolveAudienceUserIdsMock.mockResolvedValue(["u1"]);
    getPreferenceMapMock
      .mockResolvedValueOnce(new Map([["u1", DEFAULT_PREF]]))
      .mockResolvedValueOnce(new Map([["u1", { ...DEFAULT_PREF, channelsEnabled: ["EMAIL"] }]]));
    getActiveTemplateMock.mockResolvedValue({ titleTemplate: "t", bodyTemplate: "b", deepLinkTemplate: null });
    notificationFindMany.mockResolvedValue([{ id: "notif1", userId: "u1" }]);
    notificationDeliveryFindMany.mockResolvedValue([{ id: "del2", channel: "EMAIL", notificationId: "notif1" }]);
    notificationDeliveryFindUnique.mockResolvedValue({ id: "del2", attemptCount: 0, status: "PENDING" });
    providerSendMock.mockResolvedValue({ status: "FAILED", errorCode: "resend_not_configured", errorMessage: "RESEND_API_KEY не настроен." });

    await processNotificationJob("job1");

    expect(notificationDeliveryUpdate).toHaveBeenCalledWith({
      where: { id: "del2" },
      data: expect.objectContaining({ status: "FAILED", errorMessage: "RESEND_API_KEY не настроен.", nextRetryAt: expect.any(Date) }),
    });
  });

  it("канал без провайдера (TELEGRAM) — остаётся PENDING, ни findUnique, ни update не вызываются", async () => {
    notificationJobFindUnique.mockResolvedValue(job);
    resolveAudienceUserIdsMock.mockResolvedValue(["u1"]);
    getPreferenceMapMock
      .mockResolvedValueOnce(new Map([["u1", DEFAULT_PREF]]))
      .mockResolvedValueOnce(new Map([["u1", { ...DEFAULT_PREF, channelsEnabled: ["TELEGRAM"] }]]));
    getActiveTemplateMock.mockResolvedValue({ titleTemplate: "t", bodyTemplate: "b", deepLinkTemplate: null });
    notificationFindMany.mockResolvedValue([{ id: "notif1", userId: "u1" }]);
    notificationDeliveryFindMany.mockResolvedValue([{ id: "del3", channel: "TELEGRAM", notificationId: "notif1" }]);

    await processNotificationJob("job1");

    expect(notificationDeliveryFindUnique).not.toHaveBeenCalled();
    expect(notificationDeliveryUpdate).not.toHaveBeenCalled();
    expect(providerSendMock).not.toHaveBeenCalled();
  });
});

describe("processDueDeliveries() — retry sweep для Web Push/Email", () => {
  it("выбирает просроченные FAILED-доставки, вызывает провайдер и обновляет статус", async () => {
    notificationDeliveryFindMany.mockResolvedValue([
      {
        id: "del9",
        channel: "EMAIL",
        attemptCount: 1,
        status: "FAILED",
        notification: { userId: "u1", title: "t", body: "b", deepLink: "/x" },
      },
    ]);
    notificationDeliveryFindUnique.mockResolvedValue({ id: "del9", attemptCount: 1, status: "FAILED" });
    providerSendMock.mockResolvedValue({ status: "SENT" });

    const count = await processDueDeliveries(50);

    expect(notificationDeliveryFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "FAILED", nextRetryAt: { lte: expect.any(Date) } }, take: 50 })
    );
    expect(providerSendMock).toHaveBeenCalledWith({ userId: "u1", title: "t", body: "b", deepLink: "/x" });
    expect(notificationDeliveryUpdate).toHaveBeenCalledWith({ where: { id: "del9" }, data: expect.objectContaining({ status: "SENT" }) });
    expect(count).toBe(1);
  });

  it("уже SENT (гонка с параллельным вызовом) — не трогает повторно", async () => {
    notificationDeliveryFindMany.mockResolvedValue([
      { id: "del9", channel: "EMAIL", attemptCount: 1, status: "FAILED", notification: { userId: "u1", title: "t", body: "b", deepLink: null } },
    ]);
    notificationDeliveryFindUnique.mockResolvedValue({ id: "del9", attemptCount: 2, status: "SENT" });

    await processDueDeliveries(50);

    expect(providerSendMock).not.toHaveBeenCalled();
    expect(notificationDeliveryUpdate).not.toHaveBeenCalled();
  });
});

describe("processNotificationJob() — DIRECT-событие (транзакционное, не через Audience Resolver)", () => {
  it("получатель — payload.directUserId, Audience Resolver и preference-gate по категории не задействуются", async () => {
    notificationJobFindUnique.mockResolvedValue({
      id: "job2",
      status: "PENDING",
      attemptCount: 0,
      eventType: "JNJ_REGISTERED",
      payload: { entityId: "comp1", competitionName: "J&J Minsk", directUserId: "u9" },
    });
    getActiveTemplateMock.mockResolvedValue({ titleTemplate: "Вы зарегистрированы", bodyTemplate: "{{competitionName}}", deepLinkTemplate: null });
    getPreferenceMapMock.mockResolvedValue(new Map([["u9", DEFAULT_PREF]]));
    notificationFindMany.mockResolvedValue([{ id: "notif9", userId: "u9" }]);

    await processNotificationJob("job2");

    expect(resolveAudienceUserIdsMock).not.toHaveBeenCalled();
    expect(notificationCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: [expect.objectContaining({ userId: "u9", idempotencyKey: "JNJ_REGISTERED:job2:u9" })] })
    );
  });

  it("directUserId отсутствует — получателей нет, Notification не создаётся", async () => {
    notificationJobFindUnique.mockResolvedValue({
      id: "job3",
      status: "PENDING",
      attemptCount: 0,
      eventType: "SCHOOL_VERIFIED",
      payload: { entityId: "school1", schoolSlug: "s", schoolName: "n" },
    });

    await processNotificationJob("job3");

    expect(notificationCreateMany).not.toHaveBeenCalled();
    expect(notificationJobUpdate).toHaveBeenCalledWith({ where: { id: "job3" }, data: { status: "DONE", nextRetryAt: null } });
  });
});

describe("processNotificationJob() — ошибка помечает job FAILED с nextRetryAt", () => {
  it("неизвестный eventType — status=FAILED, errorMessage заполнен, nextRetryAt посчитан по attemptCount", async () => {
    notificationJobFindUnique.mockResolvedValue({ id: "job4", status: "PENDING", attemptCount: 0, eventType: "GHOST_EVENT", payload: {} });

    await processNotificationJob("job4");

    const failCall = notificationJobUpdate.mock.calls.find((c) => c[0].data.status === "FAILED");
    expect(failCall).toBeDefined();
    expect(failCall![0].data.errorMessage).toContain("GHOST_EVENT");
    expect(failCall![0].data.nextRetryAt).toBeInstanceOf(Date);
  });
});

describe("retryDeliveryNow() — Control Center (Phase 9), \"Повторить сейчас\"", () => {
  it("доставка не найдена — DeliveryNotFoundError, attemptDelivery не вызывается (провайдер не трогается)", async () => {
    notificationDeliveryFindUnique.mockResolvedValueOnce(null);

    await expect(retryDeliveryNow("ghost")).rejects.toThrow(DeliveryNotFoundError);
    expect(providerSendMock).not.toHaveBeenCalled();
  });

  it("упавшая доставка — вызывает provider.send() с текстом из связанного Notification, обновляет статус", async () => {
    notificationDeliveryFindUnique
      .mockResolvedValueOnce({
        id: "del9",
        channel: "EMAIL",
        notification: { userId: "u1", title: "t", body: "b", deepLink: "/x" },
      })
      .mockResolvedValueOnce({ id: "del9", attemptCount: 1, status: "FAILED" });
    providerSendMock.mockResolvedValue({ status: "SENT", providerMessageId: "resend-2" });

    await retryDeliveryNow("del9");

    expect(providerSendMock).toHaveBeenCalledWith({ userId: "u1", title: "t", body: "b", deepLink: "/x" });
    expect(notificationDeliveryUpdate).toHaveBeenCalledWith({
      where: { id: "del9" },
      data: expect.objectContaining({ status: "SENT", providerMessageId: "resend-2" }),
    });
  });

  it("уже DELIVERED (повторный клик по уже почёсанной вручную строке) — идемпотентно, провайдер не вызывается", async () => {
    notificationDeliveryFindUnique
      .mockResolvedValueOnce({
        id: "del9",
        channel: "EMAIL",
        notification: { userId: "u1", title: "t", body: "b", deepLink: null },
      })
      .mockResolvedValueOnce({ id: "del9", attemptCount: 2, status: "DELIVERED" });

    await retryDeliveryNow("del9");

    expect(providerSendMock).not.toHaveBeenCalled();
    expect(notificationDeliveryUpdate).not.toHaveBeenCalled();
  });
});

describe("processDueNotificationJobs() — sweep для PENDING и просроченных FAILED", () => {
  it("выбирает PENDING и FAILED с nextRetryAt в прошлом, обрабатывает каждый", async () => {
    notificationJobFindMany.mockResolvedValue([{ id: "j1" }, { id: "j2" }]);
    notificationJobFindUnique.mockResolvedValue({ id: "j1", status: "DONE" }); // DONE — processNotificationJob сразу no-op

    const count = await processDueNotificationJobs(50);

    expect(notificationJobFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ status: "PENDING" }, { status: "FAILED", nextRetryAt: { lte: expect.any(Date) } }] },
        take: 50,
      })
    );
    expect(notificationJobFindUnique).toHaveBeenCalledTimes(2);
    expect(count).toBe(2);
  });
});
