"use client";

import { useEffect, useState } from "react";
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
function BookIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M5 5a1.5 1.5 0 0 1 1.5-1.5H18a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H6.5A1.5 1.5 0 0 1 5 18.5V5Z" strokeLinejoin="round" />
      <path d="M5 17.5A1.5 1.5 0 0 1 6.5 16H19" strokeLinecap="round" />
      <path d="M8.5 7.5h7" strokeLinecap="round" />
    </svg>
  );
}
function ChevronIcon({ open }: { open: boolean }) {
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

type NavItem = { href: string; label: string; icon: React.ReactNode; match: (p: string) => boolean };

const MAIN_ITEMS: NavItem[] = [{ href: "/admin", label: "Главная", icon: <HomeIcon />, match: (p) => p === "/admin" }];

// "Соревнования" — раскрывающееся меню (по прямому запросу пользователя,
// 2026-09-09), тот же приём, что и "Справочники" ниже: список раньше был
// одной прямой ссылкой на /admin/competitions. Id текущего соревнования
// берётся прямо из pathname (сайдбар — часть общего layout.tsx, который
// оборачивает и список, и страницу конкретного соревнования) — без пропсов
// и без нового запроса.
function competitionSubItems(currentCompetitionId: string | null): NavItem[] {
  const items: NavItem[] = [
    {
      href: "/admin/competitions",
      label: "Все соревнования",
      icon: <TrophyIcon />,
      match: (p) => p === "/admin/competitions" || p === "/admin/competitions/new",
    },
  ];
  if (currentCompetitionId) {
    items.push({
      href: `/admin/competitions/${currentCompetitionId}`,
      label: "Текущее соревнование",
      icon: <TrophyIcon />,
      match: (p) => p.startsWith(`/admin/competitions/${currentCompetitionId}`),
    });
  }
  return items;
}

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

// Вертикальная боковая панель /admin (redesign по dark-SaaS reference,
// 2026-09-08) — раньше был плоский горизонтальный список ссылок без иконок и
// без выделения активного пункта. На мобильном пока сохранён прежний паттерн
// горизонтальной прокрутки (полноценный off-canvas drawer — Phase 11
// Responsive), но с той же новой раскраской, чтобы не заводить два разных
// визуальных языка на переходный период.
export function AdminSidebar({ isAdminUser }: { isAdminUser: boolean }) {
  const pathname = usePathname() ?? "";
  const referenceLinks = referenceItems();
  const referenceActive = referenceLinks.some((item) => item.match(pathname));
  // Открыт по умолчанию, если сейчас на одной из его страниц (по прямому
  // запросу пользователя, 2026-09-09 — раньше список был всегда развёрнут
  // безусловно, теперь сворачивается кликом по заголовку).
  const [referencesOpen, setReferencesOpen] = useState(referenceActive);

  const competitionsActive = pathname.startsWith("/admin/competitions");
  // "new" — форма создания, не id конкретного соревнования; для неё пункта
  // "Текущее соревнование" не показываем.
  const competitionMatch = pathname.match(/^\/admin\/competitions\/([^/?#]+)/);
  const currentCompetitionId = competitionMatch && competitionMatch[1] !== "new" ? competitionMatch[1] : null;
  const competitionLinks = competitionSubItems(currentCompetitionId);
  const [competitionsOpen, setCompetitionsOpen] = useState(competitionsActive);
  // В отличие от "Справочники" (открывается один раз, при монтировании) —
  // здесь именно ЖИВАЯ синхронизация: выбор соревнования из списка должен
  // сразу раскрыть меню и показать "Текущее соревнование", а не только при
  // первой загрузке страницы (пользователь явно попросил именно это,
  // 2026-09-09). Sidebar — часть layout.tsx и не размонтируется между
  // страницами /admin/**, поэтому obычный useState-инициализатор этого не
  // подхватил бы сам.
  useEffect(() => {
    if (competitionsActive) setCompetitionsOpen(true);
  }, [competitionsActive]);

  return (
    <nav
      className="flex shrink-0 gap-1.5 overflow-x-auto overflow-y-hidden border-b border-admin-border bg-admin-bg pb-3 font-night sm:sticky sm:top-0 sm:h-[100dvh] sm:w-[232px] sm:flex-col sm:overflow-x-hidden sm:overflow-y-auto sm:border-b-0 sm:border-r sm:bg-admin-card/30 sm:px-3 sm:pb-6 sm:pt-6"
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

      <div className="mt-0 flex shrink-0 items-center gap-1.5 sm:mt-0.5 sm:flex-col sm:items-stretch sm:gap-0.5">
        <button
          type="button"
          onClick={() => setCompetitionsOpen((v) => !v)}
          aria-expanded={competitionsOpen}
          className={`flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-app-sm px-3 py-2 text-sm font-medium transition-colors sm:w-full ${
            competitionsActive ? "text-night-text" : "text-admin-muted hover:bg-admin-card2 hover:text-night-text"
          }`}
        >
          <span className={competitionsActive ? "text-admin-primary" : "text-admin-disabled"}>
            <TrophyIcon />
          </span>
          <span className="flex-1 text-left">Соревнования</span>
          <span className={competitionsActive ? "text-admin-primary" : "text-admin-disabled"}>
            <ChevronIcon open={competitionsOpen} />
          </span>
        </button>
        <div
          className={`grid shrink-0 transition-[grid-template-rows] duration-300 ease-out sm:w-full ${
            competitionsOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          }`}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="flex shrink-0 flex-col gap-0.5 pt-0.5 sm:pl-1">
              {competitionLinks.map((item) => (
                <NavLink key={item.href} item={item} active={item.match(pathname)} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {isAdminUser && (
        <div className="mt-0 flex shrink-0 items-center gap-1.5 sm:mt-5 sm:flex-col sm:items-stretch sm:gap-0.5">
          <button
            type="button"
            onClick={() => setReferencesOpen((v) => !v)}
            aria-expanded={referencesOpen}
            className={`flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-app-sm px-3 py-2 text-sm font-medium transition-colors sm:w-full ${
              referenceActive ? "text-night-text" : "text-admin-muted hover:bg-admin-card2 hover:text-night-text"
            }`}
          >
            <span className={referenceActive ? "text-admin-primary" : "text-admin-disabled"}>
              <BookIcon />
            </span>
            <span className="flex-1 text-left">{t.nav.references}</span>
            <span className={referenceActive ? "text-admin-primary" : "text-admin-disabled"}>
              <ChevronIcon open={referencesOpen} />
            </span>
          </button>
          {/* Плавное раскрытие "выезжающим" списком — CSS grid-track трюк
              (0fr↔1fr вместо height:auto, которую CSS transition не умеет
              анимировать напрямую): список всегда в DOM, не размонтируется
              условным рендером, поэтому анимируется и открытие, и закрытие. */}
          <div
            className={`grid shrink-0 transition-[grid-template-rows] duration-300 ease-out sm:w-full ${
              referencesOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
            }`}
          >
            <div className="min-h-0 overflow-hidden">
              <div className="flex shrink-0 flex-col gap-0.5 pt-0.5 sm:pl-1">
                {referenceLinks.map((item) => (
                  <NavLink key={item.href} item={item} active={item.match(pathname)} />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
