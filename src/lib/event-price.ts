// Карточка события не показывала цену вообще (найдено пользователем вживую,
// 2026-09-13) — ни старый priceText, ни новые структурированные
// EventPriceOption. Предпочитаем структурированные варианты (задаются в
// мастере, "Билеты и регистрация"): минимальная цена среди заполненных,
// "от N" если вариантов больше одного — иначе оставшийся текстовый priceText
// (событие могло быть создано ещё старой формой, до Event Engine).
//
// Отдельный файл от src/lib/events.ts НАМЕРЕННО: events.ts импортирует Prisma
// (server-only) — импорт оттуда в клиентский компонент (StepPreview.tsx,
// живой предпросмотр в мастере) затягивал в браузерный бандл весь Prisma-
// клиент и падал на "node:async_hooks" при сборке (найдено на next build).
// Эта функция не трогает БД вообще — чистая, безопасна и на клиенте, и на
// сервере (переиспользуется в EventCard.tsx на публичных страницах тоже).
export function formatEventCardPrice(
  priceText: string | null,
  priceOptions: { price: number | string | { toString(): string } | null; currency: string | null }[]
): string | null {
  const priced = priceOptions.filter((o) => o.price != null);
  if (priced.length > 0) {
    const min = priced.reduce((a, b) => (Number(b.price) < Number(a.price) ? b : a));
    const amount = Number(min.price);
    const price = `${amount} ${min.currency ?? ""}`.trim();
    return priced.length > 1 ? `от ${price}` : price;
  }
  return priceText || null;
}
