"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

// Общие для ВСЕХ пяти узких сайдбаров разделов админки (Мониторинг/Ивенты/
// Соревнования/Школа/Фестивали, 2026-09-14) кусочки — раньше жили в одном
// AdminSidebar.tsx на всё; при разделении вынесены сюда, чтобы каждый
// SectionSidebar-файл не повторял одну и ту же разметку/иконки.

export type NavItem = { href: string; label: string; icon: ReactNode; match: (p: string) => boolean };

export function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
      className={`shrink-0 transition-transform duration-150 ${open ? "rotate-90" : ""}`}
    >
      <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Иконки — тот же приём, что и в compete/BottomNav.tsx: инлайн SVG-путь на
// currentColor, без иконочного шрифта/библиотеки (CLAUDE.md §14).
export function HomeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M3 11.5 12 4l9 7.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.5 10v9a1 1 0 0 0 1 1H17.5a1 1 0 0 0 1-1v-9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
export function TrophyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 5H4v2a3 3 0 0 0 3 3M17 5h3v2a3 3 0 0 1-3 3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 14v3M9 20h6M10 17h4v3h-4v-3Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
export function TagIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M11 3.5H5A1.5 1.5 0 0 0 3.5 5v6c0 .4.16.78.44 1.06l8 8a1.5 1.5 0 0 0 2.12 0l6-6a1.5 1.5 0 0 0 0-2.12l-8-8A1.5 1.5 0 0 0 11 3.5Z" strokeLinejoin="round" />
      <circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}
export function StepsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M4 19v-4h4v-4h4V7h4V4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
export function StarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M12 3.5l2.5 5.2 5.7.7-4.2 4 1 5.7-5-2.8-5 2.8 1-5.7-4.2-4 5.7-.7L12 3.5Z" strokeLinejoin="round" />
    </svg>
  );
}
export function HeartIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path
        d="M12 20.5s-7.5-4.6-9.8-9.3C.7 7.7 2.4 4.5 5.7 4c2.1-.3 4 .7 6.3 3 2.3-2.3 4.2-3.3 6.3-3 3.3.5 5 3.7 3.5 7.2-2.3 4.7-9.8 9.3-9.8 9.3Z"
        strokeLinejoin="round"
      />
    </svg>
  );
}
export function BookIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M5 5a1.5 1.5 0 0 1 1.5-1.5H18a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H6.5A1.5 1.5 0 0 1 5 18.5V5Z" strokeLinejoin="round" />
      <path d="M5 17.5A1.5 1.5 0 0 1 6.5 16H19" strokeLinecap="round" />
      <path d="M8.5 7.5h7" strokeLinecap="round" />
    </svg>
  );
}
export function ContentIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M6 3.5h8l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 19V5A1.5 1.5 0 0 1 6 3.5Z" strokeLinejoin="round" />
      <path d="M13.5 3.5V8h4.5" strokeLinejoin="round" />
      <path d="M9 14.5h6M12 11.5v6" strokeLinecap="round" />
    </svg>
  );
}
export function SchoolIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M3 9.5 12 4l9 5.5-9 5.5-9-5.5Z" strokeLinejoin="round" />
      <path d="M6 12v5c0 1 2.7 2.5 6 2.5s6-1.5 6-2.5v-5" strokeLinecap="round" />
    </svg>
  );
}
export function FestivalIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M4 20 8 4l4 8 4-8 4 16" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      title={item.label}
      className={`flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-app-sm px-3 py-2 text-sm font-medium no-underline transition-colors hover:no-underline sm:w-full sm:min-w-0 sm:truncate ${
        active
          ? "bg-admin-primary/15 text-night-text before:hidden sm:relative sm:before:absolute sm:before:-left-3 sm:before:top-1/2 sm:before:block sm:before:h-5 sm:before:w-[3px] sm:before:-translate-y-1/2 sm:before:rounded-full sm:before:bg-admin-primary"
          : "text-admin-muted hover:bg-admin-card2 hover:text-night-text"
      }`}
    >
      <span className={`shrink-0 ${active ? "text-admin-primary" : "text-admin-disabled"}`}>{item.icon}</span>
      <span className="sm:truncate">{item.label}</span>
    </Link>
  );
}

// Рамка сайдбара (лого + контейнер `<nav>`) — общая для всех пяти узких
// сайдбаров разделов. Лого всегда ведёт на /admin (хаб-пикер), независимо от
// текущего раздела.
export function SidebarFrame({ children }: { children: ReactNode }) {
  return (
    <nav
      className="flex shrink-0 gap-1.5 overflow-x-auto overflow-y-hidden border-b border-admin-border bg-admin-bg pb-3 font-night sm:sticky sm:top-0 sm:h-[100dvh] sm:w-[232px] sm:flex-col sm:overflow-x-hidden sm:overflow-y-auto sm:border-b-0 sm:border-r sm:bg-admin-card/30 sm:px-3 sm:pb-6 sm:pt-6"
      aria-label="Разделы админки"
    >
      <Link href="/admin" className="mb-1 hidden px-3 pb-5 no-underline hover:no-underline sm:block" aria-label="Jack &amp; Jill">
        <Image src="/branding/jnj-logo.png" alt="Jack & Jill" width={483} height={343} className="h-auto w-full mix-blend-screen" priority />
      </Link>
      {children}
    </nav>
  );
}

// Раскрывающаяся группа пунктов (по образцу "Справочники"/"Модерация" из
// прежнего AdminSidebar) — общая для всех сайдбаров, где нужна такая группа.
export function NavGroup({
  label,
  icon,
  items,
  pathname,
  defaultOpenOnActive = true,
}: {
  label: string;
  icon: ReactNode;
  items: NavItem[];
  pathname: string;
  defaultOpenOnActive?: boolean;
}) {
  const active = items.some((item) => item.match(pathname));
  return <NavGroupInner label={label} icon={icon} items={items} pathname={pathname} active={active} defaultOpenOnActive={defaultOpenOnActive} />;
}

// Вынесено отдельным компонентом, чтобы useState мог зависеть от уже
// посчитанного `active` при монтировании (открыт по умолчанию, если сейчас
// на одной из его страниц) без нарушения правил хуков.
function NavGroupInner({
  label,
  icon,
  items,
  pathname,
  active,
  defaultOpenOnActive,
}: {
  label: string;
  icon: ReactNode;
  items: NavItem[];
  pathname: string;
  active: boolean;
  defaultOpenOnActive: boolean;
}) {
  const [open, setOpen] = useState(defaultOpenOnActive && active);
  return (
    <div className="mt-0 flex shrink-0 items-center gap-1.5 sm:mt-0.5 sm:flex-col sm:items-stretch sm:gap-0.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-app-sm px-3 py-2 text-sm font-medium transition-colors sm:w-full ${
          active ? "text-night-text" : "text-admin-muted hover:bg-admin-card2 hover:text-night-text"
        }`}
      >
        <span className={active ? "text-admin-primary" : "text-admin-disabled"}>{icon}</span>
        <span className="flex-1 text-left">{label}</span>
        <span className={active ? "text-admin-primary" : "text-admin-disabled"}>
          <ChevronIcon open={open} />
        </span>
      </button>
      <div className={`grid shrink-0 transition-[grid-template-rows] duration-300 ease-out sm:w-full ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="min-h-0 overflow-hidden">
          <div className="flex shrink-0 flex-col gap-0.5 pt-0.5 sm:pl-1">
            {items.map((item) => (
              <NavLink key={item.href} item={item} active={item.match(pathname)} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
