"use client";

import { usePathname } from "next/navigation";
import { SchoolIcon, NavLink, SidebarFrame, type NavItem } from "@/components/admin/nav-shared";

// Школа (руководитель школы) — CRM своей школы, узкий сайдбар без ссылок на
// другие разделы. Пока один пункт (обзор/редактирование карточки на одной
// странице) — делегирование доступа другим администраторам школы отложено на
// следующий этап (docs/00_DECISIONS.md, 2026-09-14).
const ITEMS: NavItem[] = [{ href: "/admin/school", label: "Моя школа", icon: <SchoolIcon />, match: (p) => p === "/admin/school" }];

export function SchoolAdminSidebar() {
  const pathname = usePathname() ?? "";
  return (
    <SidebarFrame>
      <div className="flex shrink-0 gap-1.5 sm:flex-col sm:gap-0.5">
        {ITEMS.map((item) => (
          <NavLink key={item.href} item={item} active={item.match(pathname)} />
        ))}
      </div>
    </SidebarFrame>
  );
}
