// Разделы, которые несут собственную тёмную тему и полностью заменяют
// светлое сайтовое оформление (шапку и футер) — по макету Claude Design
// "JBJ Platform" (design/README.md, 06-07.09.2026). Общий список для
// HeaderVisibility и FooterVisibility, чтобы не разъезжались.
export const DARK_ROUTE_PREFIXES = ["/judging", "/compete", "/schools", "/login", "/profile", "/dancers", "/events", "/admin"];

export function isDarkRoute(pathname: string | null): boolean {
  // "/" — точное совпадение, а не префикс: startsWith("/") иначе считало бы
  // тёмным вообще любой маршрут сайта.
  return pathname === "/" || (!!pathname && DARK_ROUTE_PREFIXES.some((p) => pathname.startsWith(p)));
}
