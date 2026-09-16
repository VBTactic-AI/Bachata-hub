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
    { href: `${base}/statistics`, label: "Статистика", exact: false },
    ...(canManageTeam ? [{ href: `${base}/team`, label: "Команда", exact: false }] : []),
  ];

  // Шаблоны Pass (2026-09-16, по прямому запросу пользователя) — вложенная
  // вкладка ([id]/pass-templates/page.tsx), а не отдельная самостоятельная
  // страница (была раньше — обрывала заголовок/EventDashboardTabs карточки
  // события). Список НЕ зависит от того, в карточке какого события открыта
  // вкладка — PassTemplate принадлежит User, не Event (см. модель), но URL
  // всё равно содержит текущий eventId, чтобы вкладка оставалась внутри
  // [id]/layout.tsx, как и остальные.
  //
  // Правка по итогам UX-ревью (2026-09-16, "Event Engine Redline") —
  // визуально отделена от вкладок ЭТОГО события вертикальной чертой и
  // приглушённым стилем в неактивном состоянии, чтобы не читаться как
  // шестая равноправная вкладка карточки, а как "другой раздел".
  const passTemplatesTab = { href: `${base}/pass-templates`, label: "🏷 Шаблоны Pass", exact: false };
  const passTemplatesActive = pathname.startsWith(passTemplatesTab.href);

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

      <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 self-center bg-admin-border" />

      <Link
        href={passTemplatesTab.href}
        role="tab"
        aria-selected={passTemplatesActive}
        title="Общие для всех ваших событий — не только этого"
        className={cn(
          "shrink-0 whitespace-nowrap rounded-app-sm px-4 py-2 text-sm font-semibold no-underline transition-colors hover:no-underline",
          passTemplatesActive ? "bg-admin-primary text-white shadow-sm" : "text-admin-disabled hover:bg-admin-card2 hover:text-admin-muted"
        )}
      >
        {passTemplatesTab.label}
      </Link>
    </div>
  );
}
