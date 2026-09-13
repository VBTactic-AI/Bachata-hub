// Notification & Subscription Engine — сервис-воркер для Web Push (Phase 5).
// Payload теперь зашифрован по-настоящему (пакет web-push, RFC 8291) и
// приходит сюда уже расшифрованным браузером — event.data.json() отдаёт
// ровно то, что отправил webPushProvider.send(): { title, body, deepLink }.

self.addEventListener("push", (event) => {
  let data = { title: "Bachata HUB", body: "У вас новое уведомление.", deepLink: "/notifications" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // Payload не распарсился (не JSON) — показываем дефолтный текст, не падаем.
  }

  const options = {
    body: data.body,
    icon: "/branding/jnj-logo.png",
    badge: "/branding/jnj-logo.png",
    data: { url: data.deepLink || "/notifications" },
  };
  event.waitUntil(self.registration.showNotification(data.title, options));
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
