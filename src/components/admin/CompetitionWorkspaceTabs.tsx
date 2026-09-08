"use client";

import { useState } from "react";

export type WorkspaceTab = { id: string; label: string; content: React.ReactNode };

// Разбивает страницу соревнования на вкладки (redesign, 2026-09-08) — раньше
// всё содержимое (статус, категории, участники, судьи, статистика) шло одним
// непрерывным скроллом на 860+ строк. Данные по-прежнему грузятся ОДИН раз на
// сервере (page.tsx) — эта обёртка только переключает, какой уже отрендеренный
// блок показан, без единого дополнительного запроса к серверу. Переключение —
// локальное состояние клиента (не URL/searchParams), чтобы не гонять заново
// тяжёлый серверный фетч этой страницы (~9 SQL-запросов, задокументировано в
// docs/00_DECISIONS.md) при каждом клике по вкладке.
//
// Неактивные вкладки остаются в DOM (`hidden`, не размонтируются) — чтобы
// клиентское состояние вложенных компонентов (например, уже загруженная по
// кнопке статистика) не терялось при переключении туда-обратно.
export function CompetitionWorkspaceTabs({ tabs, defaultTab }: { tabs: WorkspaceTab[]; defaultTab?: string }) {
  const [active, setActive] = useState(defaultTab ?? tabs[0]?.id);

  return (
    <div className="flex flex-col gap-5">
      <div
        role="tablist"
        aria-label="Разделы соревнования"
        className="flex gap-1 overflow-x-auto rounded-app border border-night-border bg-night-card/50 p-1"
      >
        {tabs.map((tab) => {
          const isActive = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(tab.id)}
              className={`shrink-0 whitespace-nowrap rounded-app-sm px-4 py-2 text-sm font-semibold transition-colors ${
                isActive ? "bg-admin-primary text-white shadow-sm" : "text-night-muted hover:bg-night-card2 hover:text-night-text"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {tabs.map((tab) => (
        <div key={tab.id} hidden={tab.id !== active} role="tabpanel">
          {tab.content}
        </div>
      ))}
    </div>
  );
}
