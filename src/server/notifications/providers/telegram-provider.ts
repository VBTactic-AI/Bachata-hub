import { prisma } from "@/lib/prisma";
import type { NotificationProvider, DeliveryPayload, ProviderSendResult } from "./types";

// Telegram-провайдер поверх Bot API — обычный fetch(), без SDK (та же
// причина и тот же приём, что и у email-provider.ts). Каждый chatId,
// привязанный к пользователю (обычно один, см. telegram-link.ts), получает
// одно и то же сообщение — статус SENT, если получилось хотя бы на один.
const TELEGRAM_API_BASE = "https://api.telegram.org";

export const telegramProvider: NotificationProvider = {
  channel: "TELEGRAM",

  async send(payload: DeliveryPayload): Promise<ProviderSendResult> {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      return { status: "FAILED", errorCode: "telegram_not_configured", errorMessage: "TELEGRAM_BOT_TOKEN не настроен." };
    }

    const endpoints = await prisma.notificationEndpoint.findMany({
      where: { userId: payload.userId, channel: "TELEGRAM", enabled: true },
    });
    if (endpoints.length === 0) {
      return { status: "FAILED", errorCode: "no_endpoint", errorMessage: "Telegram не привязан у этого пользователя." };
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "";
    const text = `${payload.title}\n\n${payload.body}`;
    const replyMarkup = payload.deepLink
      ? { inline_keyboard: [[{ text: "Открыть", url: `${siteUrl}${payload.deepLink}` }]] }
      : undefined;

    let anySent = false;
    const errors: string[] = [];

    await Promise.all(
      endpoints.map(async (ep) => {
        try {
          const res = await fetch(`${TELEGRAM_API_BASE}/bot${token}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: ep.endpoint, text, reply_markup: replyMarkup }),
          });

          if (res.ok) {
            anySent = true;
            return;
          }

          const data = (await res.json().catch(() => ({}))) as { description?: string };
          errors.push(`Telegram ответил ${res.status}: ${data.description ?? ""}`);

          // 403 — пользователь заблокировал бота/удалил чат — отключаем
          // endpoint, а не ретраим бесконечно заведомо мёртвый чат (тот же
          // приём, что у Web Push при 404/410, см. web-push-provider.ts).
          if (res.status === 403) {
            await prisma.notificationEndpoint.update({ where: { id: ep.id }, data: { enabled: false } }).catch(() => {});
          }
        } catch (err) {
          errors.push(err instanceof Error ? err.message : String(err));
        }
      })
    );

    if (anySent) return { status: "SENT" };
    return { status: "FAILED", errorMessage: errors.join("; ") || "Не удалось отправить ни в один чат." };
  },
};
