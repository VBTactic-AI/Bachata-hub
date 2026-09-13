// Notification & Subscription Engine — клиентская часть Web Push (Phase 5).
// Чистые браузерные API (Notification/ServiceWorker/PushManager), без
// какой-либо серверной логики — сервер только сохраняет то, что вернул
// PushManager.subscribe() (см. /api/notification-endpoints).

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function isWebPushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
}

export class WebPushError extends Error {
  constructor(public code: "unsupported" | "permission_denied" | "no_vapid_key" | "server_error") {
    super(code);
  }
}

export async function subscribeToWebPush(): Promise<void> {
  if (!isWebPushSupported()) throw new WebPushError("unsupported");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new WebPushError("permission_denied");

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) throw new WebPushError("no_vapid_key");

  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
  }

  const json = subscription.toJSON();
  const res = await fetch("/api/notification-endpoints", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channel: "WEB_PUSH", endpoint: json.endpoint, keys: json.keys }),
  });
  if (!res.ok) throw new WebPushError("server_error");
}

export async function unsubscribeFromWebPush(): Promise<void> {
  if (!isWebPushSupported()) return;

  const registration = await navigator.serviceWorker.getRegistration("/sw.js");
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await fetch("/api/notification-endpoints", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
  }).catch(() => {});
}
