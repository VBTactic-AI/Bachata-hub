"use client";

import { usePathname } from "next/navigation";

// UX-004: судейский мобильный экран (CLAUDE.md §40 — "не перегружай
// судейский интерфейс админскими функциями") раньше показывал полный
// сайтовый Header с прямой ссылкой на "Управление соревнованиями" и
// админскими пунктами — здесь единственное место, где решается, что на
// /judging/** его не рендерим. Header остаётся server component (свои
// запросы к БД для nav-ссылок) — эта обёртка только решает, показывать ли
// уже готовый результат.
//
// Тёмный "night"-раздел (/compete, /schools, /login) по образцу макета JBJ
// Platform несёт свою собственную навигацию (DarkTopNav на десктопе,
// BottomNav на мобильном) — светлый сайтовый Header поверх нёс бы двойную
// навигацию, поэтому скрыт и там (06.09.2026).
const HIDDEN_PREFIXES = ["/judging", "/compete", "/schools", "/login", "/profile", "/dancers"];

export function HeaderVisibility({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname && HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) return null;
  return <>{children}</>;
}
