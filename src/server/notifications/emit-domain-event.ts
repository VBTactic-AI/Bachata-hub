import type { Prisma } from "@prisma/client";
import { after } from "next/server";
import { DOMAIN_EVENT_REGISTRY, type DomainEventKey, type DomainEventPayloadMap } from "@/lib/notifications/domain-event-registry";

type PrismaTx = Prisma.TransactionClient;

// Notification & Subscription Engine — точка входа для Event Engine/JNJ
// Competition Engine (Phase 6/7 подключили реальные вызовы). Вызывается
// ВНУТРИ уже существующей бизнес-транзакции (по образцу writeAudit(tx, ...)
// в src/server/audit/audit.ts) — сама рассылка (audience resolution,
// рендер шаблона, доставка) НЕ выполняется здесь и НЕ в этой транзакции
// (CLAUDE.md §21/п.21 ТЗ — не тормозить бизнес-операцию): только запись
// строки NotificationJob + планирование обработки через after() (Phase 5).
//
// idempotencyKey обязателен и передаётся вызывающим кодом (а не считается
// здесь) — только вызывающий сервис знает, что именно делает событие
// уникальным (напр. "EVENT_PUBLISHED:event_123" — повторная публикация того
// же события не создаёт вторую job; но "EVENT_UPDATED:event_123:updatedAt"
// для апдейтов, где повтор — это НОВОЕ событие). upsert с update:{} — если
// с таким же ключом job уже есть, повторный emit — no-op, не ошибка.
export async function emitDomainEvent<K extends DomainEventKey>(
  tx: PrismaTx,
  params: { type: K; payload: DomainEventPayloadMap[K]; idempotencyKey: string }
): Promise<void> {
  if (!(params.type in DOMAIN_EVENT_REGISTRY)) {
    throw new Error(`emitDomainEvent: неизвестный тип доменного события "${params.type}"`);
  }

  const job = await tx.notificationJob.upsert({
    where: { idempotencyKey: params.idempotencyKey },
    create: {
      eventType: params.type,
      payload: params.payload as Prisma.InputJsonValue,
      idempotencyKey: params.idempotencyKey,
    },
    update: {},
  });

  // after() выполняется ПОСЛЕ ответа клиенту, когда транзакция уже точно
  // закоммичена — best-effort немедленная обработка (Phase 1 архитектура),
  // без блокировки бизнес-операции. Если job не был обработан по любой
  // причине (сбой, cold start, вызов вне HTTP-запроса — см. catch ниже) —
  // его подхватит sweep (processDueNotificationJobs, Phase 5).
  try {
    after(() => {
      import("./process-job")
        .then(({ processNotificationJob }) => processNotificationJob(job.id))
        .catch((err) => console.error("emitDomainEvent: after() processNotificationJob failed:", err));
    });
  } catch {
    // after() вызван вне контекста реального HTTP-запроса (скрипт/тест) —
    // не ошибка: строка NotificationJob уже создана, обработает sweep.
  }
}
