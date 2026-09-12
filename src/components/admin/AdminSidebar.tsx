"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { t } from "@/lib/i18n/dictionary";
import { ShieldIcon, ChatIcon, BuildingIcon, AlertIcon, PeopleIcon, GridIcon, DatabaseIcon } from "@/components/admin/icons";

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
function HeartIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path
        d="M12 20.5s-7.5-4.6-9.8-9.3C.7 7.7 2.4 4.5 5.7 4c2.1-.3 4 .7 6.3 3 2.3-2.3 4.2-3.3 6.3-3 3.3.5 5 3.7 3.5 7.2-2.3 4.7-9.8 9.3-9.8 9.3Z"
        strokeLinejoin="round"
      />
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
// "Контент" (2026-09-11, по прямому запросу пользователя) — документ со
// знаком "+", для раздела с формой "Добавить событие" (перенесена сюда из
// общесайтовой кнопки Header/DarkTopNav).
function ContentIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M6 3.5h8l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 19V5A1.5 1.5 0 0 1 6 3.5Z" strokeLinejoin="round" />
      <path d="M13.5 3.5V8h4.5" strokeLinejoin="round" />
      <path d="M9 14.5h6M12 11.5v6" strokeLinecap="round" />
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

// "Соревнования" ведёт на /admin/competitions напрямую (сам пункт УЖЕ
// значит "все соревнования" — по прямому замечанию пользователя,
// 2026-09-09, отдельная строка "Все соревнования" в раскрывающемся списке
// была лишней). Раскрывается только "Текущее соревнование" — ярлык на
// открытую сейчас страницу соревнования, когда она вообще есть; id берётся
// прямо из pathname (сайдбар — часть общего layout.tsx) — без пропсов и без
// нового запроса. Если currentCompetitionId нет — раскрывать нечего, список
// пуст, шеврон не рендерится вовсе (см. ниже).
function competitionSubItems(currentCompetitionId: string | null): NavItem[] {
  if (!currentCompetitionId) return [];
  return [
    {
      href: `/admin/competitions/${currentCompetitionId}`,
      label: "Текущее соревнование",
      icon: <TrophyIcon />,
      match: (p) => p.startsWith(`/admin/competitions/${currentCompetitionId}`),
    },
  ];
}

function referenceItems(): NavItem[] {
  return [
    { href: "/admin/division-categories", label: t.nav.divisionCategories, icon: <TagIcon />, match: (p) => p.startsWith("/admin/division-categories") },
    { href: "/admin/round-stages", label: t.nav.roundStages, icon: <StepsIcon />, match: (p) => p.startsWith("/admin/round-stages") },
    { href: "/admin/judging-criteria", label: t.nav.judgingCriteria, icon: <StarIcon />, match: (p) => p.startsWith("/admin/judging-criteria") },
  ];
}

// Раздел "Модерация" — перенесён с общесайтовой кнопки в AdminTopBar сюда,
// отдельной раскрывающейся группой сайдбара (2026-09-11, по прямому запросу
// пользователя), по образцу "Справочники": каждый пункт — своя страница под
// /admin/moderation/**. Гейт — тот же isAdminUser (SUPER_ADMIN), что и у
// "Справочники"/"Приз зрительских симпатий": пока раздел временно закрыт для
// MODERATOR (см. docs/00_DECISIONS.md) — ограниченный режим для модераторов
// школы вынесен на будущее и здесь не реализован.
function moderationItems(): NavItem[] {
  return [
    { href: "/admin/moderation", label: "Обзор", icon: <GridIcon />, match: (p) => p === "/admin/moderation" },
    { href: "/admin/moderation/events", label: t.moderation.events, icon: <AlertIcon />, match: (p) => p.startsWith("/admin/moderation/events") },
    { href: "/admin/moderation/reviews", label: t.moderation.reviews, icon: <ChatIcon />, match: (p) => p.startsWith("/admin/moderation/reviews") },
    { href: "/admin/moderation/schools", label: t.moderation.schoolClaims, icon: <BuildingIcon />, match: (p) => p.startsWith("/admin/moderation/schools") },
    { href: "/admin/moderation/users", label: t.moderation.users, icon: <PeopleIcon />, match: (p) => p.startsWith("/admin/moderation/users") },
    { href: "/admin/moderation/log", label: "Журнал", icon: <BookIcon />, match: (p) => p.startsWith("/admin/moderation/log") },
  ];
}

// Отдельный самостоятельный пункт, не внутри "Справочники" — по прямому
// запросу пользователя (2026-09-11): это не общий справочник, а сводный
// отчёт по всем соревнованиям, и его не должно быть видно там же, где
// настройка категорий/этапов/критериев. Доступ — тот же isAdminUser
// (SUPER_ADMIN, см. страницу /admin/audience-vote-stats — там та же
// проверка через can(actor, "statistics:view") без competitionId).
const AUDIENCE_VOTE_STATS_ITEM: NavItem = {
  href: "/admin/audience-vote-stats",
  label: t.nav.audienceVoteStats,
  icon: <HeartIcon />,
  match: (p) => p.startsWith("/admin/audience-vote-stats"),
};

// "Контент" — пока один пункт (форма "Добавить событие", перенесена из
// общесайтовой навигации, 2026-09-11), поэтому обычная ссылка, а не
// раскрывающаяся группа, как "Справочники"/"Модерация". Доступ — тот же
// canCreateEvents, что уже был у кнопки в Header/DarkTopNav (SCHOOL_REP/
// ORGANIZER/MODERATOR/ADMIN), не сужен до isAdminUser: сужать состав тех,
// кто может добавить событие, никто не просил.
const CONTENT_ITEM: NavItem = {
  href: "/admin/content",
  label: "Контент",
  icon: <ContentIcon />,
  match: (p) => p.startsWith("/admin/content"),
};

// "База данных" (2026-09-12, по прямому запросу пользователя) — использование
// лимитов бесплатного плана Supabase (размер БД, Storage, ссылка на Egress).
// Доступ — тот же isAdminUser, что и у "Справочники"/"Модерация"/"Приз
// зрительских симпатий": это инфраструктурные данные проекта, не для
// EVENT_ADMIN и ниже.
const DATABASE_USAGE_ITEM: NavItem = {
  href: "/admin/database",
  label: t.databaseUsage.navLabel,
  icon: <DatabaseIcon />,
  match: (p) => p.startsWith("/admin/database"),
};

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
export function AdminSidebar({ isAdminUser, canManageContent }: { isAdminUser: boolean; canManageContent: boolean }) {
  const pathname = usePathname() ?? "";
  const referenceLinks = referenceItems();
  const referenceActive = referenceLinks.some((item) => item.match(pathname));
  // Открыт по умолчанию, если сейчас на одной из его страниц (по прямому
  // запросу пользователя, 2026-09-09 — раньше список был всегда развёрнут
  // безусловно, теперь сворачивается кликом по заголовку).
  const [referencesOpen, setReferencesOpen] = useState(referenceActive);

  const moderationLinks = moderationItems();
  const moderationActive = moderationLinks.some((item) => item.match(pathname));
  const [moderationOpen, setModerationOpen] = useState(moderationActive);

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
      <Link href="/admin" className="mb-1 hidden px-3 pb-5 no-underline hover:no-underline sm:block" aria-label="Jack &amp; Jill">
        {/* Логотип JNJ (2026-09-11, по прямому запросу пользователя) — только
            картинка, без дублирующего текста рядом (в самом лого уже есть
            надпись "JNJ Dance Competition"). mix-blend-screen "растворяет"
            собственный чёрный фон PNG в admin-* панели — чёрный при screen-
            блендинге эквивалентен прозрачному, остаётся только золотой узор
            логотипа поверх тёмного фона сайдбара, без видимого прямоугольника. */}
        <Image
          src="/branding/jnj-logo.png"
          alt="Jack & Jill"
          width={483}
          height={343}
          className="h-auto w-full mix-blend-screen"
          priority
        />
      </Link>

      <div className="flex shrink-0 gap-1.5 sm:flex-col sm:gap-0.5">
        {MAIN_ITEMS.map((item) => (
          <NavLink key={item.href} item={item} active={item.match(pathname)} />
        ))}
      </div>

      <div className="mt-0 flex shrink-0 items-center gap-1.5 sm:mt-0.5 sm:flex-col sm:items-stretch sm:gap-0.5">
        {/* Сам пункт — обычная ссылка (ведёт на /admin/competitions, как и
            раньше); шеврон — отдельная кнопка РЯДОМ, только сворачивает и
            разворачивает "Текущее соревнование" под ним. Кнопку внутри
            ссылки не вкладываем (интерактивный элемент в интерактивном —
            невалидный HTML), поэтому это два соседних элемента одной строки,
            не один составной. */}
        <div className="flex shrink-0 items-stretch gap-0.5 sm:w-full">
          <Link
            href="/admin/competitions"
            aria-current={competitionsActive ? "page" : undefined}
            title="Соревнования"
            className={`flex flex-1 items-center gap-2.5 whitespace-nowrap rounded-app-sm px-3 py-2 text-sm font-medium no-underline transition-colors hover:no-underline sm:min-w-0 sm:truncate ${
              competitionsActive
                ? "bg-admin-primary/15 text-night-text sm:relative sm:before:absolute sm:before:-left-3 sm:before:top-1/2 sm:before:block sm:before:h-5 sm:before:w-[3px] sm:before:-translate-y-1/2 sm:before:rounded-full sm:before:bg-admin-primary"
                : "text-admin-muted hover:bg-admin-card2 hover:text-night-text"
            }`}
          >
            <span className={`shrink-0 ${competitionsActive ? "text-admin-primary" : "text-admin-disabled"}`}>
              <TrophyIcon />
            </span>
            <span className="sm:truncate">Соревнования</span>
          </Link>
          {currentCompetitionId && (
            <button
              type="button"
              onClick={() => setCompetitionsOpen((v) => !v)}
              aria-expanded={competitionsOpen}
              aria-label={competitionsOpen ? "Свернуть текущее соревнование" : "Показать текущее соревнование"}
              className={`flex shrink-0 items-center justify-center rounded-app-sm px-2 transition-colors ${
                competitionsActive ? "text-admin-primary hover:bg-admin-card2" : "text-admin-disabled hover:bg-admin-card2 hover:text-night-text"
              }`}
            >
              <ChevronIcon open={competitionsOpen} />
            </button>
          )}
        </div>
        {currentCompetitionId && (
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
        )}
      </div>

      {canManageContent && (
        <div className="mt-0 flex shrink-0 gap-1.5 sm:mt-0.5 sm:flex-col sm:gap-0.5">
          <NavLink item={CONTENT_ITEM} active={CONTENT_ITEM.match(pathname)} />
        </div>
      )}

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

      {isAdminUser && (
        <div className="mt-0 flex shrink-0 items-center gap-1.5 sm:mt-0.5 sm:flex-col sm:items-stretch sm:gap-0.5">
          <button
            type="button"
            onClick={() => setModerationOpen((v) => !v)}
            aria-expanded={moderationOpen}
            className={`flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-app-sm px-3 py-2 text-sm font-medium transition-colors sm:w-full ${
              moderationActive ? "text-night-text" : "text-admin-muted hover:bg-admin-card2 hover:text-night-text"
            }`}
          >
            <span className={moderationActive ? "text-admin-primary" : "text-admin-disabled"}>
              <ShieldIcon />
            </span>
            <span className="flex-1 text-left">{t.nav.admin}</span>
            <span className={moderationActive ? "text-admin-primary" : "text-admin-disabled"}>
              <ChevronIcon open={moderationOpen} />
            </span>
          </button>
          <div
            className={`grid shrink-0 transition-[grid-template-rows] duration-300 ease-out sm:w-full ${
              moderationOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
            }`}
          >
            <div className="min-h-0 overflow-hidden">
              <div className="flex shrink-0 flex-col gap-0.5 pt-0.5 sm:pl-1">
                {moderationLinks.map((item) => (
                  <NavLink key={item.href} item={item} active={item.match(pathname)} />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {isAdminUser && (
        <div className="mt-0 flex shrink-0 gap-1.5 sm:mt-0.5 sm:flex-col sm:gap-0.5">
          <NavLink item={AUDIENCE_VOTE_STATS_ITEM} active={AUDIENCE_VOTE_STATS_ITEM.match(pathname)} />
        </div>
      )}

      {isAdminUser && (
        <div className="mt-0 flex shrink-0 gap-1.5 sm:mt-0.5 sm:flex-col sm:gap-0.5">
          <NavLink item={DATABASE_USAGE_ITEM} active={DATABASE_USAGE_ITEM.match(pathname)} />
        </div>
      )}
    </nav>
  );
}
