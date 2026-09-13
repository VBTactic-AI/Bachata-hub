import { NextRequest, NextResponse } from "next/server";
import { processDueNotificationJobs, processDueDeliveries } from "@/server/notifications/process-job";

// Notification & Subscription Engine — retry sweep (Phase 5, ТЗ §12/§20).
// Подхватывает то, что after() не успел/не смог обработать сразу: свежие
// NotificationJob (cold start, сбой) и просроченные FAILED NotificationDelivery
// (Web Push/Email — временная недоступность провайдера).
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

  const [jobsProcessed, deliveriesRetried] = await Promise.all([processDueNotificationJobs(), processDueDeliveries()]);

  return NextResponse.json({ ok: true, jobsProcessed, deliveriesRetried });
}

// Vercel Cron вызывает GET; внешние пингеры обычно тоже проще настраивают
// на GET — POST оставлен как альтернатива для пингеров, которые шлют POST.
export async function GET(req: NextRequest) {
  return runSweep(req);
}

export async function POST(req: NextRequest) {
  return runSweep(req);
}
