import { SignJWT, importJWK, type KeyLike } from "jose";
import { prisma } from "@/lib/prisma";
import type { NotificationProvider, DeliveryPayload, ProviderSendResult } from "./types";

// Web Push БЕЗ npm-пакета web-push: в среде разработки этой сессии
// заблокирован доступ к registry.npmjs.org (проверено — `npm install`
// и прямой curl к registry синхронно возвращают 503 от прокси песочницы;
// обычные внешние хосты вроде api.resend.com при этом доступны). Пакет
// `web-push` нужен только для двух вещей: (1) подписи VAPID JWT (ES256) —
// делает уже установленная в проекте jose, без ручной реализации ECDSA;
// (2) шифрования payload по RFC 8291 (ECDH+HKDF+AES-128-GCM) — этого здесь
// осознанно НЕТ (AUTH_SECURITY_SPEC.md: "не изобретай криптографию" — ручная
// реализация протокола шифрования того же духа, что и ручной WebAuthn).
//
// Решение: пуш отправляется БЕЗ зашифрованного payload — валидно по
// RFC 8030, браузер получает "молчаливый" push, сервис-воркер (public/sw.js)
// показывает общий текст со ссылкой на /notifications, а не персональные
// title/body конкретного уведомления. Как только появится возможность
// установить web-push (например, в окружении пользователя, где npm install
// не заблокирован), эту функцию можно заменить на webpush.sendNotification()
// с реальным payload — интерфейс NotificationProvider не изменится.
//
// Множественность подписок: NotificationDelivery — одна строка на (Notification,
// канал), не на конкретное устройство. Если у пользователя несколько
// активных Web Push подписок (несколько браузеров/устройств) — отправляем на
// ВСЕ, статус SENT если успела хотя бы одна.

async function loadVapidKey(): Promise<{ key: KeyLike; publicKeyB64: string } | null> {
  const publicKeyB64 = process.env.VAPID_PUBLIC_KEY;
  const privateKeyB64 = process.env.VAPID_PRIVATE_KEY;
  if (!publicKeyB64 || !privateKeyB64) return null;

  const publicKeyBytes = Buffer.from(publicKeyB64, "base64url");
  if (publicKeyBytes.length !== 65 || publicKeyBytes[0] !== 0x04) return null;
  const x = publicKeyBytes.subarray(1, 33);
  const y = publicKeyBytes.subarray(33, 65);

  let d = Buffer.from(privateKeyB64, "base64url");
  if (d.length < 32) d = Buffer.concat([Buffer.alloc(32 - d.length), d]);
  if (d.length !== 32) return null;

  const key = (await importJWK(
    { kty: "EC", crv: "P-256", x: x.toString("base64url"), y: y.toString("base64url"), d: d.toString("base64url") },
    "ES256"
  )) as KeyLike;
  return { key, publicKeyB64 };
}

async function buildVapidAuthHeader(endpointUrl: string): Promise<string | null> {
  const vapid = await loadVapidKey();
  if (!vapid) return null;

  const audience = new URL(endpointUrl).origin;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@bachatahub.by";

  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256" })
    .setAudience(audience)
    .setSubject(subject)
    .setExpirationTime("12h")
    .setIssuedAt()
    .sign(vapid.key);

  return `vapid t=${jwt}, k=${vapid.publicKeyB64}`;
}

async function sendToEndpoint(endpointUrl: string): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const authHeader = await buildVapidAuthHeader(endpointUrl);
  if (!authHeader) {
    return { ok: false, status: 0, message: "VAPID-ключи не настроены (VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY)." };
  }

  const res = await fetch(endpointUrl, {
    method: "POST",
    headers: { Authorization: authHeader, TTL: "86400", "Content-Length": "0" },
  });
  if (res.ok) return { ok: true };
  return { ok: false, status: res.status, message: `Push-сервис ответил ${res.status}` };
}

export const webPushProvider: NotificationProvider = {
  channel: "WEB_PUSH",

  async send(payload: DeliveryPayload): Promise<ProviderSendResult> {
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
        const result = await sendToEndpoint(ep.endpoint);
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
