"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { setShallowQueryParams } from "@/lib/shallow-query";

export type WorkspaceTab = { id: string; label: string; content: React.ReactNode };

// Разбивает страницу соревнования на вкладки (redesign, 2026-09-08) — раньше
// всё содержимое (статус, категории, участники, судьи, статистика) шло одним
// непрерывным скроллом на 860+ строк. Данные по-прежнему грузятся ОДИН раз на
// сервере (page.tsx) — эта обёртка только переключает, какой уже отрендеренный
// блок показан, без единого дополнительного запроса к серверу. Переключение —
// локальное состояние клиента, а адресная строка обновляется в обход роутера
// Next.js (setShallowQueryParams/history.replaceState, 2026-09-09 — F5 должен
// вернуть на ту же вкладку, а не сбрасывать на первую по умолчанию), поэтому
// клик по вкладке по-прежнему не гоняет заново тяжёлый серверный фетч этой
// страницы (~9 SQL-запросов, задокументировано в docs/00_DECISIONS.md).
//
// Неактивные вкладки остаются в DOM (`hidden`, не размонтируются) — чтобы
// клиентское состояние вложенных компонентов (например, уже загруженная по
// кнопке статистика) не терялось при переключении туда-обратно.
export function CompetitionWorkspaceTabs({ tabs, defaultTab }: { tabs: WorkspaceTab[]; defaultTab?: string }) {
  // Возврат со страницы "Монитор оценок судей" — та кладёт `?tab=monitor` в
  // свою ссылку "← Назад к соревнованию" (2026-09-09), чтобы вернуться сразу
  // на нужную вкладку, а не на первую по умолчанию. Читаем один раз при
  // монтировании — дальнейшее переключение вкладок по-прежнему не трогает
  // URL (см. комментарий выше про лишние запросы).
  const searchParams = useSearchParams();
  const urlTab = searchParams.get("tab");
  const initialTab = urlTab && tabs.some((t) => t.id === urlTab) ? urlTab : (defaultTab ?? tabs[0]?.id);
  const [active, setActive] = useState(initialTab);

  // Настоящий переход по ссылке на ЭТУ ЖЕ страницу с другим ?tab= (кнопки
  // "Результаты"/"Результаты этапов" в Мониторе — CompetitionMonitor.tsx,
  // JudgesLivePanel.tsx) не размонтирует уже смонтированный
  // CompetitionWorkspaceTabs — React переиспользует тот же экземпляр
  // компонента, а initialTab выше читается только один раз при первом
  // монтировании. Без этого эффекта такой клик менял бы адресную строку, но
  // видимая вкладка оставалась бы прежней (найдено вживую, 2026-09-09).
  // useSearchParams() при этом обновляется только настоящей Next.js
  // навигацией — локальные клики по вкладкам ниже (setShallowQueryParams,
  // history.replaceState в обход роутера) его не трогают, так что эффект не
  // конфликтует с shallow-переключением.
  useEffect(() => {
    const t = searchParams.get("tab");
    if (t && tabs.some((tab) => tab.id === t)) setActive(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Каждый клик по вкладке кладёт её id в адресную строку (без похода через
  // Next.js router — см. shallow-query.ts) — по прямому запросу пользователя,
  // 2026-09-09: F5 на любой вкладке должен вернуть на неё же, а не сбрасывать
  // на первую по умолчанию.
  function selectTab(id: string) {
    setActive(id);
    setShallowQueryParams({ tab: id });
  }

  return (
    <div className="flex flex-col gap-5">
      <div
        role="tablist"
        aria-label="Разделы соревнования"
        className="flex gap-1 overflow-x-auto rounded-app border border-admin-border bg-admin-card/50 p-1"
      >
        {tabs.map((tab) => {
          const isActive = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => selectTab(tab.id)}
              className={`shrink-0 whitespace-nowrap rounded-app-sm px-4 py-2 text-sm font-semibold transition-colors ${
                isActive ? "bg-admin-primary text-white shadow-sm" : "text-admin-muted hover:bg-admin-card2 hover:text-night-text"
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
