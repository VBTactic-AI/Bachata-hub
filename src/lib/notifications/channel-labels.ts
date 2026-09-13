import type { NotificationChannel } from "@prisma/client";

// Общая подпись канала — вынесена в отдельный, НЕ "use client" модуль
// намеренно: импорт обычной константы из файла с "use client"
// (ChannelPriceRow.tsx) в серверный компонент (page.tsx) резолвится в
// клиентскую ссылку, а не в реальный объект — индексация по нему на сервере
// молча возвращает undefined (найдено вживую: колонка "Канал" рендерилась
// пустой строкой). Импортируется и из клиентских, и из серверных файлов.
export const CHANNEL_LABELS: Record<NotificationChannel, string> = {
  IN_APP: "В приложении",
  WEB_PUSH: "Web Push",
  EMAIL: "Email",
  TELEGRAM: "Telegram",
  MOBILE_PUSH: "Мобильный push",
  WHATSAPP: "WhatsApp",
};
