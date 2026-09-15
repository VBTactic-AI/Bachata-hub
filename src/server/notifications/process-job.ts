import { prisma } from "@/lib/prisma";
import type { NotificationChannel } from "@prisma/client";
import { DOMAIN_EVENT_REGISTRY, type DomainEventKey, type DomainEventPayloadMap } from "@/lib/notifications/domain-event-registry";
import { resolveAudienceUserIds } from "./audience-resolver";
import { getPreferenceMap, type PreferenceLike } from "./preferences";
import { getActiveTemplate, renderTemplate } from "./templates";
import { PROVIDER_REGISTRY } from "./providers/registry";
import type { DeliveryPayload } from "./providers/types";

// Notification & Subscription Engine — обработка NotificationJob (Phase 4,
// ТЗ §11-15, §20-21). Вызывается ПОСЛЕ коммита бизнес-транзакции, которая
// создала job через emitDomainEvent() (см. Phase 1 архитектура — after()
// сразу же best-effort, плюс отдельный retry-sweep, который появится вместе
// с Delivery Engine в Phase 5).
//
// Ретраи — экспоненциальный backoff (ТЗ §12): 30с / 2мин / 10мин, максимум
// 3 попытки — не бесконечный retry. После исчерпания job остаётся FAILED
// с errorMessage, без nextRetryAt (organiser/админ видит его в Phase 9).
const RETRY_DELAYS_MS = [30_000, 120_000, 600_000];

export function computeNextRetryAt(attemptCount: number): Date | null {
  if (attemptCount > RETRY_DELAYS_MS.length) return null;
  return new Date(Date.now() + RETRY_DELAYS_MS[attemptCount - 1]);
}

// Категория-фильтр по NotificationPreference — только для RESOLVE-событий
// (рассылка по подписке). DIRECT-события (собственное действие пользователя
// — "вы зарегистрированы", "школа подтверждена") этот фильтр не проходят
// вообще, см. реестр и комментарий в domain-event-registry.ts.
type PreferenceGate = (pref: PreferenceLike, payload: Record<string, unknown>) => boolean;

const PREFERENCE_GATES: Partial<Record<DomainEventKey, PreferenceGate>> = {
  EVENT_PUBLISHED: (pref, payload) => pref.eventFormatsEnabled.includes(payload.format as never),
  EVENT_UPDATED: (pref, payload) => pref.notifyChanges && pref.eventFormatsEnabled.includes(payload.format as never),
  EVENT_CANCELLED: (pref) => pref.notifyCancellations,
  // NOTIF-001 — напоминание проходит ТОЛЬКО если пользователь в принципе
  // включил напоминания И именно ЭТО конкретное hoursBefore (из payload
  // job'а) есть в его собственном настраиваемом списке
  // reminderHoursBefore (напр. [24, 2]) — один и тот же EVENT_REMINDER-job
  // (один hoursBefore на job, см. reminders.ts) может подойти одним
  // подписчикам и не подойти другим.
  EVENT_REMINDER: (pref, payload) =>
    pref.notifyReminders &&
    pref.reminderHoursBefore.includes(payload.hoursBefore as number) &&
    pref.eventFormatsEnabled.includes(payload.format as never),
};

function passesPreferenceGate(type: DomainEventKey, pref: PreferenceLike, payload: Record<string, unknown>): boolean {
  const gate = PREFERENCE_GATES[type];
  return gate ? gate(pref, payload) : true;
}

// Доставка по конкретному каналу (Phase 5 — Delivery Engine). IN_APP не идёт
// через provider registry вообще: строка Notification уже и есть доставка
// (нет внешнего вызова). Для остальных каналов — best-effort попытка сразу
// (см. вызов из processNotificationJob) и повторные попытки из sweep'а
// (processDueDeliveries) с тем же экспоненциальным backoff, что и у job'ов.
async function attemptDelivery(delivery: { id: string; channel: NotificationChannel }, payload: DeliveryPayload): Promise<void> {
  if (delivery.channel === "IN_APP") {
    await prisma.notificationDelivery.update({
      where: { id: delivery.id },
      data: { status: "DELIVERED", attemptCount: { increment: 1 }, lastAttemptAt: new Date() },
    });
    return;
  }

  const provider = PROVIDER_REGISTRY[delivery.channel];
  if (!provider) return; // канал зарезервирован (TELEGRAM/...), провайдера ещё нет — остаётся PENDING, не ошибка

  const current = await prisma.notificationDelivery.findUnique({ where: { id: delivery.id } });
  if (!current || current.status === "SENT" || current.status === "DELIVERED") return; // идемпотентно
  const attemptCount = current.attemptCount + 1;

  const result = await provider.send(payload);

  if (result.status === "SENT") {
    await prisma.notificationDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "SENT",
        attemptCount,
        lastAttemptAt: new Date(),
        providerMessageId: result.providerMessageId ?? null,
        errorCode: null,
        errorMessage: null,
        nextRetryAt: null,
      },
    });
  } else {
    await prisma.notificationDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "FAILED",
        attemptCount,
        lastAttemptAt: new Date(),
        errorCode: result.errorCode ?? null,
        errorMessage: result.errorMessage,
        nextRetryAt: computeNextRetryAt(attemptCount),
      },
    });
  }
}

// Идемпотентно на каждом уровне: job уже DONE — no-op; Notification/
// NotificationDelivery создаются через createMany({skipDuplicates:true}) по
// уникальным ключам — повторный вызов на том же job'е (напр. после сбоя
// между шагами) не плодит дублей ни в одной из таблиц.
export async function processNotificationJob(jobId: string): Promise<void> {
  const job = await prisma.notificationJob.findUnique({ where: { id: jobId } });
  if (!job || job.status === "DONE") return;

  await prisma.notificationJob.update({
    where: { id: jobId },
    data: { status: "PROCESSING", attemptCount: { increment: 1 }, lastAttemptAt: new Date() },
  });

  try {
    const type = job.eventType as DomainEventKey;
    const config = DOMAIN_EVENT_REGISTRY[type];
    if (!config) throw new Error(`Неизвестный тип доменного события: ${job.eventType}`);

    const payload = job.payload as Record<string, unknown>;

    let recipientUserIds: string[];
    if (config.audienceKind === "DIRECT") {
      const directUserId = payload.directUserId as string | undefined;
      recipientUserIds = directUserId ? [directUserId] : [];
    } else {
      const candidates = await resolveAudienceUserIds(
        type,
        payload as unknown as DomainEventPayloadMap[DomainEventKey]
      );
      if (candidates.length === 0) {
        recipientUserIds = [];
      } else {
        const prefs = await getPreferenceMap(candidates);
        recipientUserIds = candidates.filter((uid) => passesPreferenceGate(type, prefs.get(uid)!, payload));
      }
    }

    if (recipientUserIds.length > 0) {
      const template = await getActiveTemplate(config.templateKey);
      const title = renderTemplate(template.titleTemplate, payload);
      const body = renderTemplate(template.bodyTemplate, payload);
      const deepLink = template.deepLinkTemplate ? renderTemplate(template.deepLinkTemplate, payload) : null;
      const entityId = (payload.entityId as string | undefined) ?? null;

      const notificationsData = recipientUserIds.map((userId) => ({
        userId,
        type,
        priority: config.defaultPriority,
        title,
        body,
        entityType: config.entityType,
        entityId,
        deepLink,
        idempotencyKey: `${type}:${job.id}:${userId}`,
      }));

      await prisma.notification.createMany({ data: notificationsData, skipDuplicates: true });

      const created = await prisma.notification.findMany({
        where: { idempotencyKey: { in: notificationsData.map((n) => n.idempotencyKey) } },
        select: { id: true, userId: true },
      });

      const prefsForChannels = await getPreferenceMap(created.map((n) => n.userId));
      const deliveriesData = created.flatMap((n) => {
        const channels = prefsForChannels.get(n.userId)?.channelsEnabled ?? (["IN_APP"] as NotificationChannel[]);
        return channels.map((channel) => ({ notificationId: n.id, channel }));
      });

      if (deliveriesData.length > 0) {
        await prisma.notificationDelivery.createMany({ data: deliveriesData, skipDuplicates: true });

        // Немедленная best-effort попытка по каждому каналу сразу же, не
        // дожидаясь sweep'а (Phase 1 архитектура — after() best-effort +
        // отдельный retry). IN_APP — просто пометка DELIVERED (см.
        // attemptDelivery), Web Push/Email — реальный вызов провайдера.
        const createdDeliveries = await prisma.notificationDelivery.findMany({
          where: { notificationId: { in: created.map((n) => n.id) }, status: "PENDING" },
          select: { id: true, channel: true, notificationId: true },
        });
        const userIdByNotificationId = new Map(created.map((n) => [n.id, n.userId]));

        await Promise.all(
          createdDeliveries.map((d) =>
            attemptDelivery(
              { id: d.id, channel: d.channel },
              { userId: userIdByNotificationId.get(d.notificationId)!, title, body, deepLink }
            )
          )
        );
      }
    }

    await prisma.notificationJob.update({ where: { id: jobId }, data: { status: "DONE", nextRetryAt: null } });
  } catch (err) {
    const attemptCount = job.attemptCount + 1;
    await prisma.notificationJob.update({
      where: { id: jobId },
      data: {
        status: "FAILED",
        errorMessage: err instanceof Error ? err.message : String(err),
        nextRetryAt: computeNextRetryAt(attemptCount),
      },
    });
  }
}

// Sweep — подбирает job'ы, готовые к (пере)обработке: свежесозданные
// PENDING и упавшие FAILED, у которых уже наступил nextRetryAt. Сама точка
// вызова (after()/cron) появится вместе с Delivery Engine (Phase 5) — здесь
// только сама выборка+обработка, чтобы не привязываться заранее к
// конкретному транспорту планировщика.
export async function processDueNotificationJobs(batchSize = 50): Promise<number> {
  const due = await prisma.notificationJob.findMany({
    where: {
      OR: [{ status: "PENDING" }, { status: "FAILED", nextRetryAt: { lte: new Date() } }],
    },
    take: batchSize,
    orderBy: { createdAt: "asc" },
  });

  for (const job of due) {
    await processNotificationJob(job.id);
  }
  return due.length;
}

// Sweep для NotificationDelivery — отдельный от job-уровня retry: здесь
// пересылаем по каналам (Web Push/Email), у которых первая попытка внутри
// processNotificationJob не удалась. IN_APP сюда никогда не попадает — он
// либо DELIVERED сразу, либо доставки для него нет вовсе.
export async function processDueDeliveries(batchSize = 50): Promise<number> {
  const due = await prisma.notificationDelivery.findMany({
    where: { status: "FAILED", nextRetryAt: { lte: new Date() } },
    take: batchSize,
    orderBy: { createdAt: "asc" },
    include: { notification: { select: { userId: true, title: true, body: true, deepLink: true } } },
  });

  await Promise.all(
    due.map((d) =>
      attemptDelivery(
        { id: d.id, channel: d.channel },
        { userId: d.notification.userId, title: d.notification.title, body: d.notification.body, deepLink: d.notification.deepLink }
      )
    )
  );

  return due.length;
}

export class DeliveryNotFoundError extends Error {}

// Control Center (Phase 9) — "Повторить сейчас" на конкретной упавшей
// доставке, не дожидаясь nextRetryAt/следующего sweep'а. Переиспользует
// attemptDelivery() как есть — она идемпотентна (пропускает уже SENT/
// DELIVERED), так что повторный клик по уже почёсанной вручную строке не
// отправит письмо/push дважды.
export async function retryDeliveryNow(deliveryId: string): Promise<void> {
  const delivery = await prisma.notificationDelivery.findUnique({
    where: { id: deliveryId },
    include: { notification: { select: { userId: true, title: true, body: true, deepLink: true } } },
  });
  if (!delivery) throw new DeliveryNotFoundError();

  await attemptDelivery(
    { id: delivery.id, channel: delivery.channel },
    {
      userId: delivery.notification.userId,
      title: delivery.notification.title,
      body: delivery.notification.body,
      deepLink: delivery.notification.deepLink,
    }
  );
}
