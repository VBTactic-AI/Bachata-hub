import type { NotificationChannel } from "@prisma/client";
import type { NotificationProvider } from "./types";
import { webPushProvider } from "./web-push-provider";
import { emailProvider } from "./email-provider";

// Registry, не if/else (CLAUDE.md §49) — IN_APP сюда не входит: доставка
// этого канала — сам факт существования строки Notification, без внешнего
// вызова (см. process-job.ts). TELEGRAM/MOBILE_PUSH/WHATSAPP архитектурно
// предусмотрены в enum NotificationChannel, но провайдера для них ещё нет —
// process-job.ts оставляет такие NotificationDelivery в PENDING, не ошибка.
export const PROVIDER_REGISTRY: Partial<Record<NotificationChannel, NotificationProvider>> = {
  WEB_PUSH: webPushProvider,
  EMAIL: emailProvider,
};
