"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

// §12 ТЗ (Event Dashboard, 2026-09-15) — единая оболочка события: раньше
// "Участники" и "Команда" были двумя несвязанными страницами без общего
// меню. В отличие от CompetitionWorkspaceTabs (Competition Engine, вкладки
// переключаются локально, без перехода, — там это оправдано дороговизной
// ~9 SQL-запросов одной загрузки), здесь каждая вкладка — ОТДЕЛЬНАЯ страница
// с собственной server-side пагинацией/фильтрами (см. registrations/
// page.tsx, §11 ТЗ) — обычная Next.js навигация, а не показ/скрытие уже
// загруженного. Клиентский компонент нужен только чтобы подсветить активную
// вкладку по текущему pathname.
export function EventDashboardTabs({ eventId, canManageTeam }: { eventId: string; canManageTeam: boolean }) {
  const pathname = usePathname();
  const base = `/admin/content/${eventId}`;

  const eventTabs = [
    { href: base, label: "Обзор", exact: true },
    { href: `${base}/registrations`, label: "Участники", exact: false },
    { href: `${base}/passes`, label: "Билеты и Pass", exact: false },
    { href: `${base}/orders`, label: "Заказы", exact: false },
    { href: `${base}/statistics`, label: "Статистика", exact: false },
    ...(canManageTeam ? [{ href: `${base}/team`, label: "Команда", exact: false }] : []),
  ];

  // "Шаблоны Pass" вынесены из этого набора вкладок в отдельный пункт
  // левого меню (2026-09-16, по прямому запросу пользователя — разворот
  // более раннего решения того же дня, см. EventAdminSidebar.tsx и
  // /admin/content/pass-templates/page.tsx).
  return (
    <div role="tablist" aria-label="Разделы события" className="flex items-center gap-1 overflow-x-auto rounded-app border border-admin-border bg-admin-card/50 p-1">
      {eventTabs.map((tab) => {
        const isActive = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            role="tab"
            aria-selected={isActive}
            className={cn(
              "shrink-0 whitespace-nowrap rounded-app-sm px-4 py-2 text-sm font-semibold no-underline transition-colors hover:no-underline",
              isActive ? "bg-admin-primary text-white shadow-sm" : "text-admin-muted hover:bg-admin-card2 hover:text-night-text"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
