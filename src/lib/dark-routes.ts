// Разделы, которые несут собственную тёмную тему и полностью заменяют
// светлое сайтовое оформление (шапку и футер) — по макету Claude Design
// "JBJ Platform" (design/README.md, 06-07.09.2026). Общий список для
// HeaderVisibility и FooterVisibility, чтобы не разъезжались.
export const DARK_ROUTE_PREFIXES = [
  "/judging",
  "/compete",
  "/schools",
  "/login",
  "/profile",
  "/dancers",
  "/events",
  // Festival Engine, Stage UI-5 (2026-09-17) — публичная страница фестиваля
  // использует ту же тёмную вёрстку, что и /events/[slug].
  "/festivals",
  "/admin",
  "/rating",
  "/become-organizer",
  // §7 ТЗ (Event Suggestions) — тот же тёмный раздел, что и /become-organizer
  // (аналогичная лёгкая форма от обычного пользователя).
  "/suggest-event",
  // Notification Center (Notification & Subscription Engine, Phase 8) —
  // тот же тёмный раздел, что и /profile, откуда на неё ведёт колокольчик.
  "/notifications",
];

export function isDarkRoute(pathname: string | null): boolean {
  // "/" — точное совпадение, а не префикс: startsWith("/") иначе считало бы
  // тёмным вообще любой маршрут сайта.
  return pathname === "/" || (!!pathname && DARK_ROUTE_PREFIXES.some((p) => pathname.startsWith(p)));
}
