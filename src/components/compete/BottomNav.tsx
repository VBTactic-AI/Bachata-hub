"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

type NavItem = { href: string; label: string; icon: React.ReactNode; match: (pathname: string, tab: string | null) => boolean };

function HomeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M3 11.5 12 4l9 7.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.5 10v9a1 1 0 0 0 1 1H17.5a1 1 0 0 0 1-1v-9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TrophyIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 5H4v2a3 3 0 0 0 3 3M17 5h3v2a3 3 0 0 1-3 3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 14v3M9 20h6M10 17h4v3h-4v-3Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path
        d="M12 20.5s-7.5-4.6-9.8-9.1C.6 8 2 4.7 5.2 4.1c2-.4 3.9.6 4.8 2.3.9-1.7 2.8-2.7 4.8-2.3 3.2.6 4.6 3.9 3 7.3C19.5 15.9 12 20.5 12 20.5Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20c1.2-3.5 4-5.5 7.5-5.5s6.3 2 7.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const ITEMS: NavItem[] = [
  { href: "/", label: "Главная", icon: <HomeIcon />, match: (p) => p === "/" },
  { href: "/compete", label: "Конкурсы", icon: <TrophyIcon />, match: (p, tab) => p.startsWith("/compete") && tab !== "mine" },
  { href: "/compete?tab=mine", label: "Мои", icon: <HeartIcon />, match: (p, tab) => p.startsWith("/compete") && tab === "mine" },
  { href: "/profile", label: "Профиль", icon: <UserIcon />, match: (p) => p.startsWith("/profile") },
];

// Fixed нижняя навигация мобильного приложения-раздела /compete (по
// референсу пользователя, 2026-09-04) — с учётом safe-area на iPhone.
// Внутри тёмной секции работает независимо от общего светлого Header сайта
// (не трогаем src/app/layout.tsx — root layout со старыми страницами не
// меняем, CLAUDE.md §54: минимальный набор изменений).
export function BottomNav() {
  const pathname = usePathname();
  const tab = useSearchParams().get("tab");

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-night-border bg-night-card/95 backdrop-blur-md [padding-bottom:env(safe-area-inset-bottom)]"
      aria-label="Основная навигация"
    >
      <div className="mx-auto flex max-w-[520px] items-center justify-around px-2 py-1.5">
        {ITEMS.map((item) => {
          const active = item.match(pathname, tab);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-w-[64px] flex-col items-center gap-1 rounded-app-sm px-3 py-2 text-[0.7rem] font-medium no-underline transition-colors ${
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
