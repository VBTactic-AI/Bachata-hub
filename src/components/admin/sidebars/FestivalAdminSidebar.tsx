"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FestivalIcon, NavLink, SidebarFrame, type NavItem } from "@/components/admin/nav-shared";
import { PlusIcon, GearIcon } from "@/components/admin/icons";

// Фестивали — тот же паттерн, что и EventAdminSidebar.tsx (Events Engine):
// "Мои фестивали" (хаб) + "Создать фестиваль" — два отдельных пункта, плюс
// коллапс-подпункт "Управление фестивалем", когда открыта карточка
// конкретного фестиваля (/admin/festival/[id]/**).
const HUB_ITEM: NavItem = {
  href: "/admin/festival",
  label: "Мои фестивали",
  icon: <FestivalIcon />,
  match: (p) => p === "/admin/festival",
};

const CREATE_ITEM: NavItem = {
  href: "/admin/festival/new",
  label: "Создать фестиваль",
  icon: <PlusIcon />,
  match: (p) => p === "/admin/festival/new",
};

// Любой путь `/admin/festival/<id>` (и вложенные вкладки), кроме "new" — у
// него свой первый сегмент, не id фестиваля.
const MANAGE_FESTIVAL_PATTERN = /^\/admin\/festival\/(?!new(?:\/|$))([^/]+)/;

export function FestivalAdminSidebar() {
  const pathname = usePathname() ?? "";
  const manageFestivalId = pathname.match(MANAGE_FESTIVAL_PATTERN)?.[1] ?? null;
  const hubActive = HUB_ITEM.match(pathname) || manageFestivalId !== null;

  return (
    <SidebarFrame>
      <div className="flex shrink-0 flex-col gap-1.5 sm:gap-0.5">
        <NavLink item={HUB_ITEM} active={hubActive} />

        <div className={`grid shrink-0 transition-[grid-template-rows] duration-300 ease-out ${manageFestivalId ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
          <div className="min-h-0 overflow-hidden">
            <div className="pt-0.5 sm:pl-3">
              {manageFestivalId && (
                <Link
                  href={`/admin/festival/${manageFestivalId}`}
                  aria-current="page"
                  className="flex items-center gap-2.5 whitespace-nowrap rounded-app-sm bg-admin-primary/15 px-3 py-2 text-sm font-medium text-night-text no-underline hover:no-underline"
                >
                  <span className="text-admin-primary">
                    <GearIcon />
                  </span>
                  Управление фестивалем
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
