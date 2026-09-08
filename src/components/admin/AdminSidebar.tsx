"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { t } from "@/lib/i18n/dictionary";

// Иконки — тот же приём, что и в compete/BottomNav.tsx: инлайн SVG-путь на
// currentColor, без иконочного шрифта/библиотеки (CLAUDE.md §14).
function HomeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M3 11.5 12 4l9 7.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.5 10v9a1 1 0 0 0 1 1H17.5a1 1 0 0 0 1-1v-9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function TrophyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 5H4v2a3 3 0 0 0 3 3M17 5h3v2a3 3 0 0 1-3 3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 14v3M9 20h6M10 17h4v3h-4v-3Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function TagIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M11 3.5H5A1.5 1.5 0 0 0 3.5 5v6c0 .4.16.78.44 1.06l8 8a1.5 1.5 0 0 0 2.12 0l6-6a1.5 1.5 0 0 0 0-2.12l-8-8A1.5 1.5 0 0 0 11 3.5Z" strokeLinejoin="round" />
      <circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}
function StepsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M4 19v-4h4v-4h4V7h4V4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function StarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M12 3.5l2.5 5.2 5.7.7-4.2 4 1 5.7-5-2.8-5 2.8 1-5.7-4.2-4 5.7-.7L12 3.5Z" strokeLinejoin="round" />
    </svg>
  );
}

type NavItem = { href: string; label: string; icon: React.ReactNode; match: (p: string) => boolean };

const MAIN_ITEMS: NavItem[] = [
  { href: "/admin", label: "Главная", icon: <HomeIcon />, match: (p) => p === "/admin" },
  { href: "/admin/competitions", label: "Соревнования", icon: <TrophyIcon />, match: (p) => p.startsWith("/admin/competitions") },
];

function referenceItems(): NavItem[] {
  return [
    { href: "/admin/division-categories", label: t.nav.divisionCategories, icon: <TagIcon />, match: (p) => p.startsWith("/admin/division-categories") },
    { href: "/admin/round-stages", label: t.nav.roundStages, icon: <StepsIcon />, match: (p) => p.startsWith("/admin/round-stages") },
    { href: "/admin/judging-criteria", label: t.nav.judgingCriteria, icon: <StarIcon />, match: (p) => p.startsWith("/admin/judging-criteria") },
  ];
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-app-sm px-3 py-2 text-sm font-medium no-underline transition-colors hover:no-underline sm:w-full ${
        active
          ? "bg-admin-primary/15 text-night-text before:hidden sm:relative sm:before:absolute sm:before:-left-3 sm:before:top-1/2 sm:before:block sm:before:h-5 sm:before:w-[3px] sm:before:-translate-y-1/2 sm:before:rounded-full sm:before:bg-admin-primary"
          : "text-admin-muted hover:bg-admin-card2 hover:text-night-text"
      }`}
    >
      <span className={active ? "text-admin-primary" : "text-admin-disabled"}>{item.icon}</span>
      {item.label}
    </Link>
  );
}

// Вертикальная боковая панель /admin (redesign по dark-SaaS reference,
// 2026-09-08) — раньше был плоский горизонтальный список ссылок без иконок и
// без выделения активного пункта. На мобильном пока сохранён прежний паттерн
// горизонтальной прокрутки (полноценный off-canvas drawer — Phase 11
// Responsive), но с той же новой раскраской, чтобы не заводить два разных
// визуальных языка на переходный период.
export function AdminSidebar({ isAdminUser }: { isAdminUser: boolean }) {
  const pathname = usePathname() ?? "";

  return (
    <nav
      className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-admin-border bg-admin-bg pb-3 font-night sm:sticky sm:top-0 sm:h-[100dvh] sm:w-[232px] sm:flex-col sm:overflow-x-visible sm:overflow-y-auto sm:border-b-0 sm:border-r sm:bg-admin-card/30 sm:px-3 sm:pb-6 sm:pt-6"
      aria-label="Разделы админки"
    >
      <Link
        href="/admin"
        className="mb-1 hidden items-center gap-2 px-3 pb-5 no-underline hover:no-underline sm:flex"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-app-sm bg-gradient-admin-cta text-sm font-extrabold text-white">
          JK
        </span>
        <span className="text-[0.95rem] font-extrabold tracking-tight text-night-text">Jack &amp; Kill</span>
      </Link>

      <div className="flex shrink-0 gap-1.5 sm:flex-col sm:gap-0.5">
        {MAIN_ITEMS.map((item) => (
          <NavLink key={item.href} item={item} active={item.match(pathname)} />
        ))}
      </div>

      {isAdminUser && (
        <div className="mt-0 flex shrink-0 items-center gap-1.5 sm:mt-5 sm:flex-col sm:items-stretch sm:gap-0.5">
          <span className="hidden px-3 pb-1 text-[0.68rem] font-semibold uppercase tracking-wide text-admin-disabled sm:block">
            {t.nav.references}
          </span>
          {referenceItems().map((item) => (
            <NavLink key={item.href} item={item} active={item.match(pathname)} />
          ))}
        </div>
      )}
    </nav>
  );
}
