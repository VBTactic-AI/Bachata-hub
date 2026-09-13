import { sendNotification, WebPushError } from "web-push";
import { prisma } from "@/lib/prisma";
import type { NotificationProvider, DeliveryPayload, ProviderSendResult } from "./types";

// Web Push через настоящий npm-пакет web-push (Phase 5, доработано после
// того, как пользователь установил пакет — до этого VAPID JWT собирался
// вручную через jose и push уходил БЕЗ payload, см. git-историю этого
// файла/PROGRESS.md). Теперь пуш несёт реальный зашифрованный payload
// (RFC 8291, шифрование делает сам пакет — здесь ничего не реализовано
// вручную) — сервис-воркер (public/sw.js) показывает персональные title/
// body/deepLink конкретного уведомления, не общий текст.
//
// vapidDetails передаётся ЯВНО на каждый вызов (через options), а не через
// глобальный setVapidDetails() — пакет хранит его в module-level переменной,
// что в serverless-окружении не проблема (один процесс — одна конфигурация),
// но явная передача проще тестировать и не зависит от порядка инициализации
// модулей.
//
// Множественность подписок: NotificationDelivery — одна строка на
// (Notification, канал), не на конкретное устройство. Если у пользователя
// несколько активных Web Push подписок (несколько браузеров/устройств) —
// отправляем на ВСЕ, статус SENT если успела хотя бы одна.

function getVapidDetails(): { subject: string; publicKey: string; privateKey: string } | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;
  return { subject: process.env.VAPID_SUBJECT || "mailto:admin@bachatahub.by", publicKey, privateKey };
}

async function sendToEndpoint(
  endpoint: { endpoint: string; metadata: unknown },
  payload: DeliveryPayload,
  vapidDetails: { subject: string; publicKey: string; privateKey: string }
): Promise<{ ok: true } | { ok: false; status?: number; message: string }> {
  const keys = endpoint.metadata as { p256dh?: string; auth?: string } | null;
  if (!keys?.p256dh || !keys?.auth) {
    return { ok: false, message: "У endpoint'а отсутствуют ключи шифрования (p256dh/auth)." };
  }

  const body = JSON.stringify({ title: payload.title, body: payload.body, deepLink: payload.deepLink });

  try {
    await sendNotification({ endpoint: endpoint.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } }, body, {
      vapidDetails,
      TTL: 86400,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof WebPushError) {
      return { ok: false, status: err.statusCode, message: `Push-сервис ответил ${err.statusCode}` };
    }
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export const webPushProvider: NotificationProvider = {
  channel: "WEB_PUSH",

  async send(payload: DeliveryPayload): Promise<ProviderSendResult> {
    const vapidDetails = getVapidDetails();
    if (!vapidDetails) {
      return { status: "FAILED", errorCode: "vapid_not_configured", errorMessage: "VAPID-ключи не настроены (VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY)." };
    }

    const endpoints = await prisma.notificationEndpoint.findMany({
      where: { userId: payload.userId, channel: "WEB_PUSH", enabled: true },
    });
    if (endpoints.length === 0) {
      return { status: "FAILED", errorCode: "no_endpoint", errorMessage: "Нет активной подписки Web Push у этого пользователя." };
    }

    let anySent = false;
    const errors: string[] = [];

    await Promise.all(
      endpoints.map(async (ep) => {
        const result = await sendToEndpoint(ep, payload, vapidDetails);
        if (result.ok) {
          anySent = true;
          return;
        }
        errors.push(result.message);
        // 404/410 — подписка браузера больше не существует (пользователь
        // отписался/очистил данные сайта/переустановил браузер) — отключаем
        // endpoint, а не ретраим бесконечно заведомо мёртвый адрес.
        if (result.status === 404 || result.status === 410) {
          await prisma.notificationEndpoint.update({ where: { id: ep.id }, data: { enabled: false } }).catch(() => {});
        }
      })
    );

    if (anySent) return { status: "SENT" };
    return { status: "FAILED", errorMessage: errors.join("; ") || "Не удалось отправить ни на одно устройство." };
  },
};
