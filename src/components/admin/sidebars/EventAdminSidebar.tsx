"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ContentIcon, NavLink, SidebarFrame, type NavItem } from "@/components/admin/nav-shared";
import { PlusIcon, GearIcon } from "@/components/admin/icons";

// Ивенты (организатор мероприятий) — только свои события, узкий сайдбар без
// ссылок на другие разделы (Мониторинг/Соревнования/Школу/Фестивали).
//
// Редизайн (2026-09-16, по прямому запросу пользователя): раньше "Мои
// события" была единственной ссылкой, ведущей сразу на страницу со списком
// И мастером создания под ним. Теперь список ("Мои события") и создание
// ("Создать новое событие") — два отдельных пункта меню; плюс, когда открыта
// карточка конкретного события (управление — /admin/content/[id]/**, вкладки
// Обзор/Участники/Команда/...), под "Мои события" плавно выезжает под-пункт
// "Управление событием" — чтобы было визуально видно, что мы вложены внутрь
// "Моих событий", а не на отдельном не связанном экране.
//
// "Шаблоны Pass" сюда НЕ добавлены (тот же день, повторное уточнение
// пользователя) — перенесены во вкладку карточки события (см.
// EventDashboardTabs.tsx), убраны из этого меню как отдельный пункт.
const MY_EVENTS_ITEM: NavItem = {
  href: "/admin/content",
  label: "Мои события",
  icon: <ContentIcon />,
  // Редактирование ("Редактировать" из таблицы) — по-прежнему часть "Моих
  // событий" (сюда попали из списка), в отличие от "Создать новое событие" —
  // подсвечивать его как "создание" на экране редактирования было бы неверно.
  match: (p) => p === "/admin/content" || p.startsWith("/admin/content/edit/"),
};

const CREATE_ITEM: NavItem = {
  href: "/admin/content/new",
  label: "Создать новое событие",
  icon: <PlusIcon />,
  match: (p) => p === "/admin/content/new",
};

// Карточка управления конкретным событием — любой путь `/admin/content/<id>`
// (и вложенные вкладки), КРОМЕ "new"/"edit/*"/"pass-templates" (у них свой
// первый сегмент, не id события).
const MANAGE_EVENT_PATTERN = /^\/admin\/content\/(?!new(?:\/|$)|edit(?:\/|$)|pass-templates(?:\/|$))([^/]+)/;

export function EventAdminSidebar() {
  const pathname = usePathname() ?? "";
  const manageEventId = pathname.match(MANAGE_EVENT_PATTERN)?.[1] ?? null;
  const myEventsActive = MY_EVENTS_ITEM.match(pathname) || manageEventId !== null;

  return (
    <SidebarFrame>
      <div className="flex shrink-0 flex-col gap-1.5 sm:gap-0.5">
        <NavLink item={MY_EVENTS_ITEM} active={myEventsActive} />

        {/* Плавное раскрытие — тот же приём (grid-template-rows), что и у
            NavGroup в nav-shared.tsx, но контейнер всегда смонтирован (не
            toggle-кнопка) — сам факт видимости решает URL, а не клик. */}
        <div className={`grid shrink-0 transition-[grid-template-rows] duration-300 ease-out ${manageEventId ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
          <div className="min-h-0 overflow-hidden">
            <div className="pt-0.5 sm:pl-3">
              {manageEventId && (
                <Link
                  href={`/admin/content/${manageEventId}`}
                  aria-current="page"
                  className="flex items-center gap-2.5 whitespace-nowrap rounded-app-sm bg-admin-primary/15 px-3 py-2 text-sm font-medium text-night-text no-underline hover:no-underline"
                >
                  <span className="text-admin-primary">
                    <GearIcon />
                  </span>
                  Управление событием
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-0 flex shrink-0 gap-1.5 sm:mt-5 sm:flex-col sm:gap-0.5">
        <NavLink item={CREATE_ITEM} active={CREATE_ITEM.match(pathname)} />
      </div>
    </SidebarFrame>
  );
}
