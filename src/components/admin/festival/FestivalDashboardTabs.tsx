"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

// Консоль одного фестиваля — тот же приём, что и EventDashboardTabs.tsx
// (Events Engine): каждая вкладка — отдельная страница со своей загрузкой
// данных, не показ/скрытие уже загруженного. Рассылка по Pass — не своя
// вкладка, часть «Пассы» (см. FestivalPassBroadcastPanel.tsx). «Публикация»
// (2026-09-19, Stage R3 переноса UI-прототипа) — вынесена с «Обзора» в
// отдельную вкладку по образцу прототипа (чеклист + danger-zone архивации/
// удаления).
export function FestivalDashboardTabs({ festivalId }: { festivalId: string }) {
  const pathname = usePathname();
  const base = `/admin/festival/${festivalId}`;

  const tabs = [
    { href: base, label: "Обзор", exact: true },
    { href: `${base}/program`, label: "Программа", exact: false },
    { href: `${base}/team`, label: "Команда", exact: false },
    { href: `${base}/passes`, label: "Пассы", exact: false },
    { href: `${base}/sponsors`, label: "Спонсоры", exact: false },
    { href: `${base}/faq`, label: "FAQ", exact: false },
    { href: `${base}/guests`, label: "Вопросы и отзывы", exact: false },
    { href: `${base}/budget`, label: "Бюджет", exact: false },
    { href: `${base}/publish`, label: "Публикация", exact: false },
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
