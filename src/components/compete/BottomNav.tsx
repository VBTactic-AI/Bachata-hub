"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

type NavItem = { href: string; label: string; icon: React.ReactNode; match: (pathname: string, tab: string | null) => boolean };

function HomeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M3 11.5 12 4l9 7.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.5 10v9a1 1 0 0 0 1 1H17.5a1 1 0 0 0 1-1v-9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TrophyIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 5H4v2a3 3 0 0 0 3 3M17 5h3v2a3 3 0 0 1-3 3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 14v3M9 20h6M10 17h4v3h-4v-3Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EventsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15" rx="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.5 9.5h17" strokeLinecap="round" />
      <path d="M8 3v3.5M16 3v3.5" strokeLinecap="round" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M6 10a6 6 0 1 1 12 0c0 3.5 1 5 1.5 6H4.5C5 15 6 13.5 6 10Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.5 19a2.5 2.5 0 0 0 5 0" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20c1.2-3.5 4-5.5 7.5-5.5s6.3 2 7.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SchoolIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M3 9.5 12 5l9 4.5-9 4.5-9-4.5Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 11.5V16c0 1.1 2.2 2 5 2s5-.9 5-2v-4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AdminIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="4" y="5" width="16" height="15" rx="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 3.5h6M9 9.5h6M9 13.5h6M9 17h3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const BASE_ITEMS: NavItem[] = [
  { href: "/", label: "Главная", icon: <HomeIcon />, match: (p) => p === "/" },
  { href: "/compete", label: "Конкурсы", icon: <TrophyIcon />, match: (p) => p.startsWith("/compete") },
  { href: "/events", label: "События", icon: <EventsIcon />, match: (p) => p.startsWith("/events") },
  { href: "/schools", label: "Школы", icon: <SchoolIcon />, match: (p) => p.startsWith("/schools") },
  { href: "/profile", label: "Профиль", icon: <UserIcon />, match: (p) => p.startsWith("/profile") },
  { href: "/notifications", label: "Уведомления", icon: <BellIcon />, match: (p) => p.startsWith("/notifications") },
];

const ADMIN_ITEM: NavItem = { href: "/admin", label: "Управление", icon: <AdminIcon />, match: (p) => p.startsWith("/admin") };

// Fixed нижняя навигация мобильного приложения-раздела /compete (по
// референсу пользователя, 2026-09-04) — с учётом safe-area на iPhone.
// Внутри тёмной секции работает независимо от общего светлого Header сайта
// (не трогаем src/app/layout.tsx — root layout со старыми страницами не
// меняем, CLAUDE.md §54: минимальный набор изменений).
//
// "Управление" — единственный вход в /admin на мобильном: DarkTopNav (там
// эта ссылка есть) скрыт на узких экранах, а BottomNav — это единственная
// постоянная навигация. Без неё организатор не мог попасть в свою же
// админку с телефона (найдено пользователем, 07.09.2026). Условие показа —
// то же hasCompetitionAccess ("любой залогиненный"), что и в DarkTopNav.
export function BottomNav({ hasCompetitionAccess = false }: { hasCompetitionAccess?: boolean }) {
  const pathname = usePathname();
  const tab = useSearchParams().get("tab");
  const items = hasCompetitionAccess ? [...BASE_ITEMS, ADMIN_ITEM] : BASE_ITEMS;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-night-border bg-night-card/95 backdrop-blur-md [padding-bottom:env(safe-area-inset-bottom)]"
      aria-label="Основная навигация"
    >
      <div className="mx-auto flex max-w-[560px] items-center justify-around overflow-x-auto px-1 py-1.5">
        {items.map((item) => {
          const active = item.match(pathname, tab);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-w-[50px] shrink-0 flex-col items-center gap-0.5 rounded-app-sm px-1 py-1.5 text-center text-[0.62rem] font-medium leading-tight no-underline transition-colors ${
                active ? "text-night-pink" : "text-night-muted hover:text-night-text"
              }`}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
