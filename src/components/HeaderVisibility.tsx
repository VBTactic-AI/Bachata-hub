"use client";

import { usePathname } from "next/navigation";

// UX-004: судейский мобильный экран (CLAUDE.md §40 — "не перегружай
// судейский интерфейс админскими функциями") раньше показывал полный
// сайтовый Header с прямой ссылкой на "Управление соревнованиями" и
// админскими пунктами — здесь единственное место, где решается, что на
// /judging/** его не рендерим. Header остаётся server component (свои
// запросы к БД для nav-ссылок) — эта обёртка только решает, показывать ли
// уже готовый результат.
export function HeaderVisibility({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname?.startsWith("/judging")) return null;
  return <>{children}</>;
}
