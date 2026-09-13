// Notification & Subscription Engine — сервис-воркер для Web Push (Phase 5).
//
// Push приходит БЕЗ зашифрованного payload (см. комментарий в
// src/server/notifications/providers/web-push-provider.ts — почему: нет
// возможности установить npm-пакет web-push в среде разработки, а ручная
// реализация RFC 8291 шифрования — то самое "не изобретай криптографию",
// AUTH_SECURITY_SPEC.md). Поэтому event.data здесь всегда пусто — воркер
// показывает общий текст со ссылкой на Notification Center, а не
// персональные title/body конкретного уведомления. Как только появится
// шифрование, здесь же можно будет читать event.data.json().

self.addEventListener("push", (event) => {
  const title = "Bachata HUB";
  const options = {
    body: "У вас новое уведомление — откройте, чтобы посмотреть.",
    icon: "/branding/jnj-logo.png",
    badge: "/branding/jnj-logo.png",
    data: { url: "/notifications" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/notifications";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
