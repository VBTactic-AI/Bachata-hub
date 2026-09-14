"use client";

import { usePathname } from "next/navigation";
import { ContentIcon, NavLink, SidebarFrame, type NavItem } from "@/components/admin/nav-shared";

// Ивенты (организатор мероприятий) — только свои события, узкий сайдбар без
// ссылок на другие разделы (Мониторинг/Соревнования/Школу/Фестивали).
const ITEMS: NavItem[] = [
  { href: "/admin/content", label: "Мои события", icon: <ContentIcon />, match: (p) => p === "/admin/content" },
];

export function EventAdminSidebar() {
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
