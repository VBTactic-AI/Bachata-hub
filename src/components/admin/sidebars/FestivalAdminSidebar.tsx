"use client";

import { usePathname } from "next/navigation";
import { FestivalIcon, NavLink, SidebarFrame, type NavItem } from "@/components/admin/nav-shared";

// Фестивали — доступ одобрен, сама система ведения фестивалей ещё в
// разработке (docs/00_DECISIONS.md, 2026-09-14) — один пункт-заглушка.
const ITEMS: NavItem[] = [{ href: "/admin/festival", label: "Фестивали", icon: <FestivalIcon />, match: (p) => p === "/admin/festival" }];

export function FestivalAdminSidebar() {
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
