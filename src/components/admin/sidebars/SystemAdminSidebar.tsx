"use client";

import { usePathname } from "next/navigation";
import { t } from "@/lib/i18n/dictionary";
import { ShieldIcon, ChatIcon, BuildingIcon, AlertIcon, PeopleIcon, GridIcon, DatabaseIcon, BellIcon, BulbIcon } from "@/components/admin/icons";
import { HomeIcon, TrophyIcon, HeartIcon, BookIcon, ContentIcon, SchoolIcon, NavLink, NavGroup, SidebarFrame, type NavItem } from "@/components/admin/nav-shared";

// Мониторинг — только SUPER_ADMIN (гейт проверяет layout.tsx выше). Помимо
// своих собственных разделов (Модерация/Оповещения/БД/Приз зрительских
// симпатий) даёт READ-доступ во все остальные админки разом: "Соревнования"
// и так уже показывают ВСЕ соревнования супер-админу (существующая логика
// /admin/competitions/page.tsx), "Ивенты"/"Школы" — новые read-виды
// (/admin/system/events, /admin/system/schools), см. docs/00_DECISIONS.md.
const MAIN_ITEM: NavItem = { href: "/admin/system", label: "Главная", icon: <HomeIcon />, match: (p) => p === "/admin/system" };

const OTHER_ADMINS_ITEMS: NavItem[] = [
  { href: "/admin/competitions", label: "Соревнования (все)", icon: <TrophyIcon />, match: (p) => p.startsWith("/admin/competitions") },
  { href: "/admin/system/events", label: "Ивенты (все)", icon: <ContentIcon />, match: (p) => p.startsWith("/admin/system/events") },
  { href: "/admin/system/schools", label: "Школы (просмотр)", icon: <SchoolIcon />, match: (p) => p.startsWith("/admin/system/schools") },
];

function moderationItems(): NavItem[] {
  return [
    { href: "/admin/system/moderation", label: "Обзор", icon: <GridIcon />, match: (p) => p === "/admin/system/moderation" },
    { href: "/admin/system/moderation/events", label: t.moderation.events, icon: <AlertIcon />, match: (p) => p.startsWith("/admin/system/moderation/events") },
    {
      href: "/admin/system/moderation/event-suggestions",
      label: "Предложения событий",
      icon: <BulbIcon />,
      match: (p) => p.startsWith("/admin/system/moderation/event-suggestions"),
    },
    { href: "/admin/system/moderation/reviews", label: t.moderation.reviews, icon: <ChatIcon />, match: (p) => p.startsWith("/admin/system/moderation/reviews") },
    { href: "/admin/system/moderation/schools", label: t.moderation.schoolClaims, icon: <BuildingIcon />, match: (p) => p.startsWith("/admin/system/moderation/schools") },
    {
      href: "/admin/system/moderation/organizer-requests",
      label: "Заявки организаторов",
      icon: <PeopleIcon />,
      match: (p) => p.startsWith("/admin/system/moderation/organizer-requests"),
    },
    { href: "/admin/system/moderation/access", label: "Выданные доступы", icon: <ShieldIcon />, match: (p) => p.startsWith("/admin/system/moderation/access") },
    { href: "/admin/system/moderation/users", label: t.moderation.users, icon: <PeopleIcon />, match: (p) => p.startsWith("/admin/system/moderation/users") },
    { href: "/admin/system/moderation/log", label: "Журнал", icon: <BookIcon />, match: (p) => p.startsWith("/admin/system/moderation/log") },
  ];
}

const AUDIENCE_VOTE_STATS_ITEM: NavItem = {
  href: "/admin/system/audience-vote-stats",
  label: t.nav.audienceVoteStats,
  icon: <HeartIcon />,
  match: (p) => p.startsWith("/admin/system/audience-vote-stats"),
};
const DATABASE_USAGE_ITEM: NavItem = {
  href: "/admin/system/database",
  label: t.databaseUsage.navLabel,
  icon: <DatabaseIcon />,
  match: (p) => p.startsWith("/admin/system/database"),
};
const NOTIFICATIONS_ITEM: NavItem = {
  href: "/admin/system/notifications",
  label: "Оповещения",
  icon: <BellIcon />,
  match: (p) => p.startsWith("/admin/system/notifications"),
};

export function SystemAdminSidebar() {
  const pathname = usePathname() ?? "";

  return (
    <SidebarFrame>
      <div className="flex shrink-0 gap-1.5 sm:flex-col sm:gap-0.5">
        <NavLink item={MAIN_ITEM} active={MAIN_ITEM.match(pathname)} />
      </div>

      <div className="mt-0 flex shrink-0 gap-1.5 sm:mt-5 sm:flex-col sm:gap-0.5">
        {OTHER_ADMINS_ITEMS.map((item) => (
          <NavLink key={item.href} item={item} active={item.match(pathname)} />
        ))}
      </div>

      <NavGroup label="Модерация" icon={<ShieldIcon />} items={moderationItems()} pathname={pathname} />

      <div className="mt-0 flex shrink-0 gap-1.5 sm:mt-0.5 sm:flex-col sm:gap-0.5">
        <NavLink item={AUDIENCE_VOTE_STATS_ITEM} active={AUDIENCE_VOTE_STATS_ITEM.match(pathname)} />
      </div>
      <div className="mt-0 flex shrink-0 gap-1.5 sm:mt-0.5 sm:flex-col sm:gap-0.5">
        <NavLink item={DATABASE_USAGE_ITEM} active={DATABASE_USAGE_ITEM.match(pathname)} />
      </div>
      <div className="mt-0 flex shrink-0 gap-1.5 sm:mt-0.5 sm:flex-col sm:gap-0.5">
        <NavLink item={NOTIFICATIONS_ITEM} active={NOTIFICATIONS_ITEM.match(pathname)} />
      </div>
    </SidebarFrame>
  );
}
