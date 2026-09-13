// Минимальные типы для пакета web-push (@types/web-push не установлен —
// npm registry был недоступен в среде разработки на момент Phase 5, см.
// docs/00_DECISIONS.md/PROGRESS.md; сам пакет web-push пользователь
// установил вручную). Покрывает только то, что реально использует
// src/server/notifications/providers/web-push-provider.ts.
declare module "web-push" {
  export interface PushSubscription {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  }

  export interface VapidDetails {
    subject: string;
    publicKey: string;
    privateKey: string;
  }

  export interface SendOptions {
    vapidDetails?: VapidDetails;
    TTL?: number;
    headers?: Record<string, string>;
    contentEncoding?: "aes128gcm" | "aesgcm";
    urgency?: "very-low" | "low" | "normal" | "high";
  }

  export interface SendResult {
    statusCode: number;
    body: string;
    headers: Record<string, string>;
  }

  export class WebPushError extends Error {
    statusCode: number;
    headers: Record<string, string>;
    body: string;
    endpoint: string;
  }

  export function sendNotification(
    subscription: PushSubscription,
    payload?: string | Buffer,
    options?: SendOptions
  ): Promise<SendResult>;

  export function setVapidDetails(subject: string, publicKey: string, privateKey: string): void;

  export function generateVAPIDKeys(): { publicKey: string; privateKey: string };
}
