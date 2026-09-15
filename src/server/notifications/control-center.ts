import type { EventFormat, NotificationChannel, NotificationDeliveryStatus, SubscriptionType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getEventTypeConfig } from "@/lib/events/event-type-registry";

// Subscription & Notification Control Center — read-side aggregations for
// the admin dashboard (/admin/notifications). Ничего здесь не решает бизнес-
// правил рассылки (это Notification Engine, см. subscriptions.ts/
// process-job.ts) — только отчётность поверх уже существующих таблиц, по
// образцу src/server/statistics/*.ts (Этап 11: "статистика не должна изменять
// исторические данные").

export const NON_IN_APP_CHANNELS: NotificationChannel[] = ["WEB_PUSH", "EMAIL", "TELEGRAM", "MOBILE_PUSH", "WHATSAPP"];
export const ENDPOINT_CHANNELS: NotificationChannel[] = ["WEB_PUSH", "TELEGRAM", "MOBILE_PUSH"];
const ALL_SUBSCRIPTION_TYPES: SubscriptionType[] = ["EVENT", "SCHOOL", "CITY", "COUNTRY", "EVENT_TYPE", "INSTRUCTOR", "ORGANIZER"];

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// Подписки — "кто на что подписан"
// ---------------------------------------------------------------------------

export type SubscriptionTypeBreakdown = {
  type: SubscriptionType;
  subscriptionsCount: number;
  uniqueTargetsCount: number;
  topTargets: { targetId: string; label: string; subscribersCount: number }[];
};

export type SubscriptionOverview = {
  totalSubscribers: number;
  totalSubscriptions: number;
  byType: SubscriptionTypeBreakdown[];
};

// Имена целей — разными таблицами в зависимости от типа (Subscription не
// хранит displayName, только targetId, см. schema.prisma). EVENT_TYPE не
// требует похода в БД — код формата уже описан в EVENT_TYPE_REGISTRY.
// Экспортирована — переиспользуется Broadcast для снимка targetLabel при
// отправке рассылки на конкретную цель (одна и та же логика "как назвать
// эту цель", не дублируется).
export async function resolveTargetLabels(type: SubscriptionType, targetIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (targetIds.length === 0) return map;

  if (type === "EVENT_TYPE") {
    for (const id of targetIds) {
      const config = getEventTypeConfig(id as EventFormat);
      map.set(id, config?.label ?? id);
    }
    return map;
  }

  if (type === "EVENT") {
    const rows = await prisma.event.findMany({ where: { id: { in: targetIds } }, select: { id: true, title: true } });
    for (const r of rows) map.set(r.id, r.title);
  } else if (type === "SCHOOL") {
    const rows = await prisma.school.findMany({ where: { id: { in: targetIds } }, select: { id: true, name: true } });
    for (const r of rows) map.set(r.id, r.name);
  } else if (type === "CITY") {
    const rows = await prisma.city.findMany({ where: { id: { in: targetIds } }, select: { id: true, nameRu: true } });
    for (const r of rows) map.set(r.id, r.nameRu);
  } else if (type === "COUNTRY") {
    const rows = await prisma.country.findMany({ where: { id: { in: targetIds } }, select: { id: true, nameRu: true } });
    for (const r of rows) map.set(r.id, r.nameRu);
  } else if (type === "INSTRUCTOR") {
    const rows = await prisma.teacher.findMany({ where: { id: { in: targetIds } }, select: { id: true, name: true } });
    for (const r of rows) map.set(r.id, r.name);
  } else if (type === "ORGANIZER") {
    const rows = await prisma.user.findMany({
      where: { id: { in: targetIds } },
      select: { id: true, email: true, dancer: { select: { displayName: true } } },
    });
    for (const r of rows) map.set(r.id, r.dancer ? `${r.dancer.displayName} (${r.email})` : r.email);
  }

  return map;
}

export async function getSubscriptionOverview(topTargetsLimit = 5): Promise<SubscriptionOverview> {
  const [totalSubscribersRows, totalSubscriptions, perType] = await Promise.all([
    prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(DISTINCT "userId") AS count FROM "Subscription"`,
    prisma.subscription.count(),
    prisma.$queryRaw<{ type: SubscriptionType; subscriptions: bigint; targets: bigint }[]>`
      SELECT "type", COUNT(*) AS subscriptions, COUNT(DISTINCT "targetId") AS targets
      FROM "Subscription"
      GROUP BY "type"
    `,
  ]);

  const countsByType = new Map(perType.map((r) => [r.type, r]));

  const byType = await Promise.all(
    ALL_SUBSCRIPTION_TYPES.map(async (type): Promise<SubscriptionTypeBreakdown> => {
      const counts = countsByType.get(type);
      if (!counts || Number(counts.subscriptions) === 0) {
        return { type, subscriptionsCount: 0, uniqueTargetsCount: 0, topTargets: [] };
      }

      // orderBy на _count._all не типизирован для этой версии Prisma-клиента
      // (5.18) — сортируем и режем в JS. Таблица Subscription по проекту
      // остаётся маленькой (см. performance audit, A30), лишний груз не
      // ожидается.
      const groupedRows = await prisma.subscription.groupBy({
        by: ["targetId"],
        where: { type },
        _count: { _all: true },
      });
      const topRows = groupedRows.sort((a, b) => b._count._all - a._count._all).slice(0, topTargetsLimit);

      const labels = await resolveTargetLabels(
        type,
        topRows.map((r) => r.targetId)
      );

      return {
        type,
        subscriptionsCount: Number(counts.subscriptions),
        uniqueTargetsCount: Number(counts.targets),
        topTargets: topRows.map((r) => ({
          targetId: r.targetId,
          label: labels.get(r.targetId) ?? r.targetId,
          subscribersCount: r._count._all,
        })),
      };
    })
  );

  return {
    totalSubscribers: Number(totalSubscribersRows[0]?.count ?? 0n),
    totalSubscriptions,
    byType,
  };
}

// ---------------------------------------------------------------------------
// Каналы — "какие каналы используются"
// ---------------------------------------------------------------------------

export type ChannelUsage = {
  channel: NotificationChannel;
  usersEnabledCount: number; // сколько пользователей включили канал в NotificationPreference
  activeEndpointsCount: number | null; // null — каналу не нужен endpoint (IN_APP/EMAIL)
  providerConfigured: boolean | null; // null — каналу вообще не нужен внешний провайдер (IN_APP)
};

// EMAIL берёт адрес из User.email напрямую (см. providers/email-provider.ts) —
// "настроен" здесь означает "есть ключ провайдера в окружении", не "есть
// адрес" (адрес есть у любого пользователя по определению).
function isProviderConfigured(channel: NotificationChannel): boolean | null {
  if (channel === "IN_APP") return null;
  if (channel === "EMAIL") return Boolean(process.env.RESEND_API_KEY);
  if (channel === "WEB_PUSH") return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
  if (channel === "TELEGRAM") return Boolean(process.env.TELEGRAM_BOT_TOKEN);
  return false; // MOBILE_PUSH/WHATSAPP — провайдера в проекте ещё нет (см. providers/registry.ts)
}

export async function getChannelUsageOverview(): Promise<ChannelUsage[]> {
  // Postgres-массив channelsEnabled не сгруппировать через Prisma groupBy —
  // один raw-запрос с unnest() вместо N отдельных count() по каждому каналу.
  const rows = await prisma.$queryRaw<{ channel: NotificationChannel; count: bigint }[]>`
    SELECT unnest("channelsEnabled") AS channel, COUNT(*) AS count
    FROM "NotificationPreference"
    GROUP BY channel
  `;
  const enabledCounts = new Map(rows.map((r) => [r.channel, Number(r.count)]));

  const endpointRows = await prisma.notificationEndpoint.groupBy({
    by: ["channel"],
    where: { enabled: true, channel: { in: ENDPOINT_CHANNELS } },
    _count: { _all: true },
  });
  const endpointCounts = new Map(endpointRows.map((r) => [r.channel, r._count._all]));

  const allChannels: NotificationChannel[] = ["IN_APP", ...NON_IN_APP_CHANNELS];
  return allChannels.map((channel) => ({
    channel,
    usersEnabledCount: enabledCounts.get(channel) ?? 0,
    activeEndpointsCount: ENDPOINT_CHANNELS.includes(channel) ? endpointCounts.get(channel) ?? 0 : null,
    providerConfigured: isProviderConfigured(channel),
  }));
}

// ---------------------------------------------------------------------------
// Объём уведомлений — "какие уведомления отправляются"
// ---------------------------------------------------------------------------

export type NotificationVolumeByType = { type: string; count: number };

export async function getNotificationVolumeOverview(days: number): Promise<{ total: number; byType: NotificationVolumeByType[] }> {
  const since = daysAgo(days);
  const rows = await prisma.notification.groupBy({
    by: ["type"],
    where: { createdAt: { gte: since } },
    _count: { _all: true },
  });
  const sorted = [...rows].sort((a, b) => b._count._all - a._count._all);

  return {
    total: sorted.reduce((sum, r) => sum + r._count._all, 0),
    byType: sorted.map((r) => ({ type: r.type, count: r._count._all })),
  };
}

// ---------------------------------------------------------------------------
// Phase 9 — статистика доставки
// ---------------------------------------------------------------------------

export type ChannelDeliveryStats = {
  channel: NotificationChannel;
  total: number;
  byStatus: Partial<Record<NotificationDeliveryStatus, number>>;
  successCount: number; // SENT + DELIVERED
  failedCount: number;
  successRatePercent: number | null; // null — 0 попыток за период, делить не на что
};

export async function getDeliveryStats(days: number): Promise<ChannelDeliveryStats[]> {
  const since = daysAgo(days);
  const rows = await prisma.notificationDelivery.groupBy({
    by: ["channel", "status"],
    where: { createdAt: { gte: since } },
    _count: { _all: true },
  });

  const byChannel = new Map<NotificationChannel, Partial<Record<NotificationDeliveryStatus, number>>>();
  for (const row of rows) {
    const bucket = byChannel.get(row.channel) ?? {};
    bucket[row.status] = row._count._all;
    byChannel.set(row.channel, bucket);
  }

  const allChannels: NotificationChannel[] = ["IN_APP", ...NON_IN_APP_CHANNELS];
  return allChannels.map((channel) => {
    const byStatus = byChannel.get(channel) ?? {};
    const total = Object.values(byStatus).reduce((s, v) => s + (v ?? 0), 0);
    const successCount = (byStatus.SENT ?? 0) + (byStatus.DELIVERED ?? 0);
    const failedCount = byStatus.FAILED ?? 0;
    const resolved = successCount + failedCount; // PENDING/PROCESSING/CANCELLED ещё не имеют исхода — не участвуют в проценте
    return {
      channel,
      total,
      byStatus,
      successCount,
      failedCount,
      successRatePercent: resolved === 0 ? null : Math.round((successCount / resolved) * 100),
    };
  });
}

export type FailedDeliveryRow = {
  id: string;
  channel: NotificationChannel;
  notificationId: string;
  title: string;
  userId: string;
  userEmail: string;
  attemptCount: number;
  lastAttemptAt: Date | null;
  nextRetryAt: Date | null;
  errorCode: string | null;
  errorMessage: string | null;
};

export async function listFailedDeliveries(opts: { cursor?: string; limit?: number } = {}): Promise<{
  rows: FailedDeliveryRow[];
  nextCursor: string | null;
}> {
  const limit = Math.min(opts.limit ?? 25, 100);

  const rows = await prisma.notificationDelivery.findMany({
    where: { status: "FAILED" },
    orderBy: { lastAttemptAt: "desc" },
    take: limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    include: { notification: { select: { title: true, userId: true, user: { select: { email: true } } } } },
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  return {
    rows: page.map((r) => ({
      id: r.id,
      channel: r.channel,
      notificationId: r.notificationId,
      title: r.notification.title,
      userId: r.notification.userId,
      userEmail: r.notification.user.email,
      attemptCount: r.attemptCount,
      lastAttemptAt: r.lastAttemptAt,
      nextRetryAt: r.nextRetryAt,
      errorCode: r.errorCode,
      errorMessage: r.errorMessage,
    })),
    nextCursor: hasMore ? page[page.length - 1]!.id : null,
  };
}

export type FailedJobRow = {
  id: string;
  eventType: string;
  attemptCount: number;
  lastAttemptAt: Date | null;
  nextRetryAt: Date | null;
  errorMessage: string | null;
};

export async function listFailedJobs(opts: { cursor?: string; limit?: number } = {}): Promise<{
  rows: FailedJobRow[];
  nextCursor: string | null;
}> {
  const limit = Math.min(opts.limit ?? 25, 100);

  const rows = await prisma.notificationJob.findMany({
    where: { status: "FAILED" },
    orderBy: { lastAttemptAt: "desc" },
    take: limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  return {
    rows: page.map((r) => ({
      id: r.id,
      eventType: r.eventType,
      attemptCount: r.attemptCount,
      lastAttemptAt: r.lastAttemptAt,
      nextRetryAt: r.nextRetryAt,
      errorMessage: r.errorMessage,
    })),
    nextCursor: hasMore ? page[page.length - 1]!.id : null,
  };
}

// ---------------------------------------------------------------------------
// Стоимость (оценка) — настраиваемая цена за канал × объём успешных доставок
// ---------------------------------------------------------------------------

export type ChannelPrice = { channel: NotificationChannel; pricePerThousand: number; currency: string };

export async function listChannelPrices(): Promise<ChannelPrice[]> {
  const rows = await prisma.notificationChannelPrice.findMany();
  const byChannel = new Map(rows.map((r) => [r.channel, r]));

  return NON_IN_APP_CHANNELS.map((channel) => {
    const row = byChannel.get(channel);
    return { channel, pricePerThousand: row ? Number(row.pricePerThousand) : 0, currency: row?.currency ?? "USD" };
  });
}

export class InvalidChannelPriceError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

export async function setChannelPrice(
  updatedById: string,
  channel: NotificationChannel,
  pricePerThousand: number,
  currency = "USD"
): Promise<void> {
  if (channel === "IN_APP") throw new InvalidChannelPriceError("in_app_is_always_free");
  if (!Number.isFinite(pricePerThousand) || pricePerThousand < 0) throw new InvalidChannelPriceError("invalid_price");

  await prisma.notificationChannelPrice.upsert({
    where: { channel },
    create: { channel, pricePerThousand, currency, updatedById },
    update: { pricePerThousand, currency, updatedById },
  });
}

export type EstimatedCostRow = { channel: NotificationChannel; sentCount: number; pricePerThousand: number; currency: string; cost: number };

// Оценка — по УСПЕШНО отправленным доставкам за период (SENT/DELIVERED), не
// по всем попыткам: упавшая доставка ничего не стоила провайдеру.
export async function getEstimatedCost(days: number): Promise<{ rows: EstimatedCostRow[]; totalByCurrency: Record<string, number> }> {
  const [deliveryStats, prices] = await Promise.all([getDeliveryStats(days), listChannelPrices()]);
  const priceByChannel = new Map(prices.map((p) => [p.channel, p]));

  const rows: EstimatedCostRow[] = NON_IN_APP_CHANNELS.map((channel) => {
    const stats = deliveryStats.find((s) => s.channel === channel);
    const price = priceByChannel.get(channel)!;
    const sentCount = stats?.successCount ?? 0;
    return {
      channel,
      sentCount,
      pricePerThousand: price.pricePerThousand,
      currency: price.currency,
      cost: (sentCount / 1000) * price.pricePerThousand,
    };
  });

  const totalByCurrency: Record<string, number> = {};
  for (const row of rows) {
    totalByCurrency[row.currency] = (totalByCurrency[row.currency] ?? 0) + row.cost;
  }

  return { rows, totalByCurrency };
}
