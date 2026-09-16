import { NextRequest, NextResponse } from "next/server";
import { processDueNotificationJobs, processDueDeliveries } from "@/server/notifications/process-job";
import { processDueEventReminders } from "@/server/notifications/reminders";
import { generateDueSeriesOccurrences } from "@/server/events/series-generation";
import { publishDueSeriesOccurrences } from "@/server/events/series-publish";

// Notification & Subscription Engine — retry sweep (Phase 5, ТЗ §12/§20).
// Подхватывает то, что after() не успел/не смог обработать сразу: свежие
// NotificationJob (cold start, сбой) и просроченные FAILED NotificationDelivery
// (Web Push/Email — временная недоступность провайдера).
//
// С 2026-09-16 сюда же подключены Recurring Events (генерация occurrences
// EventSeries + автопубликация — src/server/events/series-generation.ts,
// series-publish.ts) — единственный периодический механизм в проекте,
// переиспользуется вместо отдельного cron-роута.
//
// Кто именно дёргает этот эндпоинт — не важно для кода (см. Phase 1
// архитектура): пока Vercel Hobby, это внешний бесплатный пингер
// (cron-job.org и т.п.) раз в 1-5 мин + Vercel Cron раз в сутки как
// safety-net (см. vercel.json); на Pro — просто учащается Vercel Cron,
// эндпоинт не меняется.
//
// Проверка секрета поддерживает оба формата: "Authorization: Bearer <secret>"
// (так Vercel Cron сам подставляет CRON_SECRET) и заголовок x-cron-secret
// (для внешних пингеров, где встроенной поддержки Bearer может не быть).
function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // не настроено — эндпоинт не работает вообще, не "открыт по умолчанию"

  const authHeader = req.headers.get("authorization");
  if (authHeader === `Bearer ${secret}`) return true;

  const customHeader = req.headers.get("x-cron-secret");
  return customHeader === secret;
}

async function runSweep(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Recurring Events (2026-09-16) — генерация будущих occurrences и
  // автопубликация серий переиспользуют ЭТОТ ЖЕ sweep (задача §8: "найти,
  // какой механизм уже используется... использовать существующую
  // архитектуру"), а не отдельный cron-роут — иначе пришлось бы отдельно
  // донастраивать уже работающий внешний пингер (cron-job.org) на новый URL.
  // Идут ДО реминдеров/notification-джобов: генерация/публикация — источник
  // истины для Event (создаёт/публикует строки), реминдеры лишь читают уже
  // опубликованные события, порядок важен, чтобы свежеопубликованный
  // occurrence мог в этом же тике попасть под реминдер, если T-минус-N уже
  // наступил (маловероятно при обычных горизонтах, но не мешает).
  const { seriesProcessed, occurrencesCreated, ended } = await generateDueSeriesOccurrences();
  const { published: occurrencesPublished } = await publishDueSeriesOccurrences();

  // NOTIF-001 — реминдеры (processDueEventReminders) идут ДО общего sweep'а
  // (не параллельно), потому что сами создают/апсертят NotificationJob'ы
  // (через emitDomainEvent) — processDueNotificationJobs ниже должен увидеть
  // уже созданные реминдер-job'ы этого же тика, а не только на следующем.
  const remindersEmitted = await processDueEventReminders();
  const [jobsProcessed, deliveriesRetried] = await Promise.all([processDueNotificationJobs(), processDueDeliveries()]);

  return NextResponse.json({
    ok: true,
    seriesProcessed,
    occurrencesCreated,
    seriesEnded: ended,
    occurrencesPublished,
    remindersEmitted,
    jobsProcessed,
    deliveriesRetried,
  });
}

// Vercel Cron вызывает GET; внешние пингеры обычно тоже проще настраивают
// на GET — POST оставлен как альтернатива для пингеров, которые шлют POST.
export async function GET(req: NextRequest) {
  return runSweep(req);
}

export async function POST(req: NextRequest) {
  return runSweep(req);
}
