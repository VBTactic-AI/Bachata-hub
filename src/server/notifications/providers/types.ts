import type { NotificationChannel } from "@prisma/client";

// Notification & Subscription Engine — Delivery Engine (Phase 5, ТЗ §32-34).
// Провайдер сам резолвит адресата (User.email для Email, NotificationEndpoint
// для Web Push) — вызывающий код (process-job.ts) передаёт только userId и
// уже отрендеренный текст, не детали конкретного канала. Добавление нового
// канала = новый файл-провайдер + запись в registry.ts, без изменения
// process-job.ts (CLAUDE.md §49).
export type DeliveryPayload = {
  userId: string;
  title: string;
  body: string;
  deepLink: string | null;
};

export type ProviderSendResult =
  | { status: "SENT"; providerMessageId?: string }
  | { status: "FAILED"; errorCode?: string; errorMessage: string };

export interface NotificationProvider {
  channel: NotificationChannel;
  send(payload: DeliveryPayload): Promise<ProviderSendResult>;
}
