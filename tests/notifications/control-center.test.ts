import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const queryRaw = vi.fn();
const subscriptionCount = vi.fn();
const subscriptionGroupBy = vi.fn();
const eventFindMany = vi.fn();
const schoolFindMany = vi.fn();
const cityFindMany = vi.fn();
const countryFindMany = vi.fn();
const teacherFindMany = vi.fn();
const notificationEndpointGroupBy = vi.fn();
const notificationGroupBy = vi.fn();
const notificationDeliveryGroupBy = vi.fn();
const notificationDeliveryFindMany = vi.fn();
const notificationJobFindMany = vi.fn();
const notificationChannelPriceFindMany = vi.fn();
const notificationChannelPriceUpsert = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: (...a: unknown[]) => queryRaw(...a),
    subscription: {
      count: (...a: unknown[]) => subscriptionCount(...a),
      groupBy: (...a: unknown[]) => subscriptionGroupBy(...a),
    },
    event: { findMany: (...a: unknown[]) => eventFindMany(...a) },
    school: { findMany: (...a: unknown[]) => schoolFindMany(...a) },
    city: { findMany: (...a: unknown[]) => cityFindMany(...a) },
    country: { findMany: (...a: unknown[]) => countryFindMany(...a) },
    teacher: { findMany: (...a: unknown[]) => teacherFindMany(...a) },
    notificationEndpoint: { groupBy: (...a: unknown[]) => notificationEndpointGroupBy(...a) },
    notification: { groupBy: (...a: unknown[]) => notificationGroupBy(...a) },
    notificationDelivery: {
      groupBy: (...a: unknown[]) => notificationDeliveryGroupBy(...a),
      findMany: (...a: unknown[]) => notificationDeliveryFindMany(...a),
    },
    notificationJob: { findMany: (...a: unknown[]) => notificationJobFindMany(...a) },
    notificationChannelPrice: {
      findMany: (...a: unknown[]) => notificationChannelPriceFindMany(...a),
      upsert: (...a: unknown[]) => notificationChannelPriceUpsert(...a),
    },
  },
}));

const {
  getSubscriptionOverview,
  getChannelUsageOverview,
  getNotificationVolumeOverview,
  getDeliveryStats,
  getEstimatedCost,
  listChannelPrices,
  setChannelPrice,
  InvalidChannelPriceError,
  listFailedDeliveries,
  listFailedJobs,
  NON_IN_APP_CHANNELS,
} = await import("@/server/notifications/control-center");

beforeEach(() => {
  queryRaw.mockReset();
  subscriptionCount.mockReset();
  subscriptionGroupBy.mockReset().mockResolvedValue([]);
  eventFindMany.mockReset().mockResolvedValue([]);
  schoolFindMany.mockReset().mockResolvedValue([]);
  cityFindMany.mockReset().mockResolvedValue([]);
  countryFindMany.mockReset().mockResolvedValue([]);
  teacherFindMany.mockReset().mockResolvedValue([]);
  notificationEndpointGroupBy.mockReset().mockResolvedValue([]);
  notificationGroupBy.mockReset().mockResolvedValue([]);
  notificationDeliveryGroupBy.mockReset().mockResolvedValue([]);
  notificationDeliveryFindMany.mockReset().mockResolvedValue([]);
  notificationJobFindMany.mockReset().mockResolvedValue([]);
  notificationChannelPriceFindMany.mockReset().mockResolvedValue([]);
  notificationChannelPriceUpsert.mockReset().mockResolvedValue({});
});

describe("getSubscriptionOverview() — кто на что подписан", () => {
  it("считает всего подписчиков/подписок и разбивку по типу с топ-целями", async () => {
    queryRaw
      .mockResolvedValueOnce([{ count: 7n }]) // COUNT(DISTINCT userId)
      .mockResolvedValueOnce([{ type: "SCHOOL", subscriptions: 3n, targets: 2n }]); // GROUP BY type
    subscriptionCount.mockResolvedValue(10);
    subscriptionGroupBy.mockImplementation(async ({ where }: { where: { type: string } }) => {
      if (where.type === "SCHOOL") {
        return [
          { targetId: "school1", _count: { _all: 2 } },
          { targetId: "school2", _count: { _all: 1 } },
        ];
      }
      return [];
    });
    schoolFindMany.mockResolvedValue([
      { id: "school1", name: "Salsa Minsk" },
      { id: "school2", name: "Bachata Loco" },
    ]);

    const overview = await getSubscriptionOverview();

    expect(overview.totalSubscribers).toBe(7);
    expect(overview.totalSubscriptions).toBe(10);

    const school = overview.byType.find((b) => b.type === "SCHOOL")!;
    expect(school.subscriptionsCount).toBe(3);
    expect(school.uniqueTargetsCount).toBe(2);
    expect(school.topTargets).toEqual([
      { targetId: "school1", label: "Salsa Minsk", subscribersCount: 2 },
      { targetId: "school2", label: "Bachata Loco", subscribersCount: 1 },
    ]);

    // Тип без единой подписки — нулевая разбивка, без похода в groupBy/БД имён.
    const country = overview.byType.find((b) => b.type === "COUNTRY")!;
    expect(country).toEqual({ type: "COUNTRY", subscriptionsCount: 0, uniqueTargetsCount: 0, topTargets: [] });
  });

  it("EVENT_TYPE — имя берётся из реестра форматов событий, без запроса к БД", async () => {
    queryRaw
      .mockResolvedValueOnce([{ count: 1n }])
      .mockResolvedValueOnce([{ type: "EVENT_TYPE", subscriptions: 1n, targets: 1n }]);
    subscriptionCount.mockResolvedValue(1);
    subscriptionGroupBy.mockImplementation(async ({ where }: { where: { type: string } }) =>
      where.type === "EVENT_TYPE" ? [{ targetId: "MASTERCLASS", _count: { _all: 1 } }] : []
    );

    const overview = await getSubscriptionOverview();

    const eventType = overview.byType.find((b) => b.type === "EVENT_TYPE")!;
    expect(eventType.topTargets).toEqual([{ targetId: "MASTERCLASS", label: "Мастер-класс", subscribersCount: 1 }]);
    expect(schoolFindMany).not.toHaveBeenCalled();
    expect(eventFindMany).not.toHaveBeenCalled();
  });
});

describe("getChannelUsageOverview() — какие каналы используются", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });
  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it("считает включивших канал пользователей (raw unnest) и активные endpoint'ы по каналам, которым они нужны", async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    queryRaw.mockResolvedValueOnce([
      { channel: "IN_APP", count: 40n },
      { channel: "EMAIL", count: 12n },
    ]);
    notificationEndpointGroupBy.mockResolvedValue([{ channel: "WEB_PUSH", _count: { _all: 5 } }]);

    const usage = await getChannelUsageOverview();

    const inApp = usage.find((u) => u.channel === "IN_APP")!;
    expect(inApp.usersEnabledCount).toBe(40);
    expect(inApp.activeEndpointsCount).toBeNull(); // IN_APP не требует endpoint
    expect(inApp.providerConfigured).toBeNull(); // не уходит вовне

    const webPush = usage.find((u) => u.channel === "WEB_PUSH")!;
    expect(webPush.activeEndpointsCount).toBe(5);

    const telegram = usage.find((u) => u.channel === "TELEGRAM")!;
    expect(telegram.usersEnabledCount).toBe(0); // канал не встретился в raw-результате
    expect(telegram.activeEndpointsCount).toBe(0); // endpoint-канал, но пока 0
    expect(telegram.providerConfigured).toBe(false); // TELEGRAM_BOT_TOKEN не задан
  });

  it("EMAIL/WEB_PUSH/TELEGRAM — 'настроен', только если реальный секрет провайдера есть в окружении", async () => {
    queryRaw.mockResolvedValueOnce([]);
    delete process.env.RESEND_API_KEY;
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    delete process.env.TELEGRAM_BOT_TOKEN;

    let usage = await getChannelUsageOverview();
    expect(usage.find((u) => u.channel === "EMAIL")!.providerConfigured).toBe(false);
    expect(usage.find((u) => u.channel === "WEB_PUSH")!.providerConfigured).toBe(false);
    expect(usage.find((u) => u.channel === "TELEGRAM")!.providerConfigured).toBe(false);

    process.env.RESEND_API_KEY = "re_test";
    process.env.VAPID_PUBLIC_KEY = "pub";
    process.env.VAPID_PRIVATE_KEY = "priv";
    process.env.TELEGRAM_BOT_TOKEN = "123:abc";
    queryRaw.mockResolvedValueOnce([]);

    usage = await getChannelUsageOverview();
    expect(usage.find((u) => u.channel === "EMAIL")!.providerConfigured).toBe(true);
    expect(usage.find((u) => u.channel === "WEB_PUSH")!.providerConfigured).toBe(true);
    expect(usage.find((u) => u.channel === "TELEGRAM")!.providerConfigured).toBe(true);
  });
});

describe("getNotificationVolumeOverview() — объём уведомлений за период", () => {
  it("группирует по типу события и считает общий итог", async () => {
    notificationGroupBy.mockResolvedValue([
      { type: "EVENT_PUBLISHED", _count: { _all: 5 } },
      { type: "JNJ_REGISTERED", _count: { _all: 2 } },
    ]);

    const volume = await getNotificationVolumeOverview(30);

    expect(volume.total).toBe(7);
    expect(volume.byType).toEqual([
      { type: "EVENT_PUBLISHED", count: 5 },
      { type: "JNJ_REGISTERED", count: 2 },
    ]);
    expect(notificationGroupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { createdAt: { gte: expect.any(Date) } } })
    );
  });
});

describe("getDeliveryStats() — Phase 9, статистика доставки по каналам", () => {
  it("успешные (SENT+DELIVERED) и ошибки считаются раздельно, % успеха — только по завершённым исходам", async () => {
    notificationDeliveryGroupBy.mockResolvedValue([
      { channel: "EMAIL", status: "SENT", _count: { _all: 8 } },
      { channel: "EMAIL", status: "FAILED", _count: { _all: 2 } },
      { channel: "EMAIL", status: "PENDING", _count: { _all: 1 } }, // ещё не имеет исхода
      { channel: "WEB_PUSH", status: "DELIVERED", _count: { _all: 3 } },
    ]);

    const stats = await getDeliveryStats(30);

    const email = stats.find((s) => s.channel === "EMAIL")!;
    expect(email.total).toBe(11);
    expect(email.successCount).toBe(8);
    expect(email.failedCount).toBe(2);
    expect(email.successRatePercent).toBe(80); // 8/(8+2), PENDING не в знаменателе

    const webPush = stats.find((s) => s.channel === "WEB_PUSH")!;
    expect(webPush.successCount).toBe(3);
    expect(webPush.successRatePercent).toBe(100);

    const telegram = stats.find((s) => s.channel === "TELEGRAM")!;
    expect(telegram.total).toBe(0);
    expect(telegram.successRatePercent).toBeNull(); // 0 попыток — делить не на что, не 0%
  });
});

describe("Стоимость (оценка) — цена за канал и её применение", () => {
  it("listChannelPrices() — канал без строки в БД получает цену 0/USD по умолчанию, IN_APP не входит в список", async () => {
    notificationChannelPriceFindMany.mockResolvedValue([{ channel: "EMAIL", pricePerThousand: 0.4, currency: "USD" }]);

    const prices = await listChannelPrices();

    expect(prices).toHaveLength(NON_IN_APP_CHANNELS.length);
    expect(prices.find((p) => p.channel === "EMAIL")).toEqual({ channel: "EMAIL", pricePerThousand: 0.4, currency: "USD" });
    expect(prices.find((p) => p.channel === "TELEGRAM")).toEqual({ channel: "TELEGRAM", pricePerThousand: 0, currency: "USD" });
    expect(prices.some((p) => p.channel === "IN_APP")).toBe(false);
  });

  it("setChannelPrice() — отклоняет IN_APP (всегда бесплатный канал), не вызывает upsert", async () => {
    await expect(setChannelPrice("admin1", "IN_APP", 1)).rejects.toThrow(InvalidChannelPriceError);
    expect(notificationChannelPriceUpsert).not.toHaveBeenCalled();
  });

  it("setChannelPrice() — отклоняет отрицательную цену", async () => {
    await expect(setChannelPrice("admin1", "EMAIL", -0.1)).rejects.toThrow(InvalidChannelPriceError);
    expect(notificationChannelPriceUpsert).not.toHaveBeenCalled();
  });

  it("setChannelPrice() — валидная цена сохраняется upsert'ом с автором изменения", async () => {
    await setChannelPrice("admin1", "EMAIL", 0.5, "USD");

    expect(notificationChannelPriceUpsert).toHaveBeenCalledWith({
      where: { channel: "EMAIL" },
      create: { channel: "EMAIL", pricePerThousand: 0.5, currency: "USD", updatedById: "admin1" },
      update: { pricePerThousand: 0.5, currency: "USD", updatedById: "admin1" },
    });
  });

  it("getEstimatedCost() — оценка = успешные доставки × цена/1000; IN_APP не участвует", async () => {
    notificationDeliveryGroupBy.mockResolvedValue([{ channel: "EMAIL", status: "SENT", _count: { _all: 2000 } }]);
    notificationChannelPriceFindMany.mockResolvedValue([{ channel: "EMAIL", pricePerThousand: 0.4, currency: "USD" }]);

    const result = await getEstimatedCost(30);

    const email = result.rows.find((r) => r.channel === "EMAIL")!;
    expect(email.sentCount).toBe(2000);
    expect(email.cost).toBeCloseTo(0.8, 5);
    expect(result.totalByCurrency.USD).toBeCloseTo(0.8, 5);
    expect(result.rows.some((r) => r.channel === "IN_APP")).toBe(false);
  });
});

describe("listFailedDeliveries()/listFailedJobs() — пагинация Phase 9", () => {
  it("listFailedDeliveries — берёт limit+1, возвращает nextCursor только если реально есть ещё", async () => {
    notificationDeliveryFindMany.mockResolvedValue([
      { id: "d1", channel: "EMAIL", notificationId: "n1", attemptCount: 1, lastAttemptAt: null, nextRetryAt: null, errorCode: "500", errorMessage: "boom", notification: { title: "Т1", userId: "u1", user: { email: "a@x.com" } } },
      { id: "d2", channel: "EMAIL", notificationId: "n2", attemptCount: 1, lastAttemptAt: null, nextRetryAt: null, errorCode: null, errorMessage: "boom2", notification: { title: "Т2", userId: "u2", user: { email: "b@x.com" } } },
    ]);

    const result = await listFailedDeliveries({ limit: 1 });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toEqual(
      expect.objectContaining({ id: "d1", userEmail: "a@x.com", title: "Т1", errorMessage: "boom" })
    );
    expect(result.nextCursor).toBe("d1");
  });

  it("listFailedJobs — без лишней страницы nextCursor = null", async () => {
    notificationJobFindMany.mockResolvedValue([
      { id: "j1", eventType: "EVENT_PUBLISHED", attemptCount: 3, lastAttemptAt: null, nextRetryAt: null, errorMessage: "fail" },
    ]);

    const result = await listFailedJobs({ limit: 25 });

    expect(result.rows).toEqual([
      { id: "j1", eventType: "EVENT_PUBLISHED", attemptCount: 3, lastAttemptAt: null, nextRetryAt: null, errorMessage: "fail" },
    ]);
    expect(result.nextCursor).toBeNull();
  });
});
