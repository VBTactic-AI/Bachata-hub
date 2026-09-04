"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

const TABS: { value: string; label: string }[] = [
  { value: "all", label: "Все" },
  { value: "soon", label: "Ближайшие" },
  { value: "mine", label: "Мои" },
];

// Активная вкладка — из query (?tab=...), не из клиентского состояния —
// страница остаётся server-rendered (список тянется в самом page.tsx по
// searchParams), этот компонент только переключает ссылку и подсвечивает
// активный пункт.
export function FilterTabs() {
  const tab = useSearchParams().get("tab") ?? "all";

  return (
    <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Фильтр соревнований">
      {TABS.map((t) => {
        const active = t.value === tab;
        return (
          <Link
            key={t.value}
            href={t.value === "all" ? "/compete" : `/compete?tab=${t.value}`}
            role="tab"
            aria-selected={active}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold no-underline transition-colors ${
              active ? "bg-gradient-night-cta text-white" : "border border-night-border bg-night-card text-night-muted hover:text-night-text"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
