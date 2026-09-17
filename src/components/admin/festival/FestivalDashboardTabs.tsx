"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

// Консоль одного фестиваля — тот же приём, что и EventDashboardTabs.tsx
// (Events Engine): каждая вкладка — отдельная страница со своей загрузкой
// данных, не показ/скрытие уже загруженного. Список вкладок расширяется по
// мере переноса разделов UI-макета (docs/PROGRESS.md, Festival Engine UI
// transfer) — пока реализованы только "Обзор"/"Программа", остальные
// добавляются следующими стадиями, чтобы не заводить ссылки на
// несуществующие страницы (404 хуже отсутствующей вкладки).
export function FestivalDashboardTabs({ festivalId }: { festivalId: string }) {
  const pathname = usePathname();
  const base = `/admin/festival/${festivalId}`;

  const tabs = [
    { href: base, label: "Обзор", exact: true },
    { href: `${base}/program`, label: "Программа", exact: false },
  ];

  return (
    <div
      role="tablist"
      aria-label="Разделы фестиваля"
      className="flex items-center gap-1 overflow-x-auto rounded-app border border-admin-border bg-admin-card/50 p-1"
    >
      {tabs.map((tab) => {
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
