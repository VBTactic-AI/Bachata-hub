"use client";

import { useState } from "react";
import { JudgeScoreButtons } from "@/components/admin/JudgeScoreButtons";
import type { JudgeQueueItem } from "@/server/judging/scoring";

type HeatGroup = { heatId: string; heatNumber: number; items: JudgeQueueItem[] };

// Вкладки "Все"/"Заход N" внутри одного раунда (по прямому запросу
// пользователя, 2026-09-10 — заменяет прежний вариант "все заходы одной
// прокручиваемой лентой с пилюлями быстрого перехода", у которого на
// практике "плыла" вёрстка). "Все" открыта по умолчанию — самый частый
// случай (сравнить участников всего раунда между собой, не только одного
// захода). Локальный клиентский стейт, без синхронизации с URL — доска не
// самостоятельная страница (в отличие от CompetitionWorkspaceTabs), а один
// блок среди, максимум нескольких, на экране судьи.
export function JudgingRoundBoard({
  heats,
  confirmed,
  footer,
}: {
  heats: HeatGroup[];
  confirmed: boolean;
  // Строка квоты + кнопка "Готово" — рендерятся сервер-компонентом
  // (page.tsx, там же считается прогресс) и передаются готовым деревом, а не
  // пересчитываются здесь. null — формат без подтверждения (например, ещё
  // не настроен judgingMaxScore/finalistsCount), тогда нижней панели нет.
  footer: React.ReactNode;
}) {
  const [tab, setTab] = useState<string>("all");
  const showTabs = heats.length > 1;
  const visibleHeats = tab === "all" ? heats : heats.filter((h) => h.heatId === tab);

  return (
    <div className="flex flex-col gap-3 rounded-app border border-admin-border bg-admin-card p-3">
      {showTabs && (
        <div role="tablist" aria-label="Заходы раунда" className="flex gap-1 overflow-x-auto rounded-app-sm border border-admin-border bg-admin-bg/60 p-1">
          <TabButton active={tab === "all"} onClick={() => setTab("all")}>
            Все
          </TabButton>
          {heats.map((h) => (
            <TabButton key={h.heatId} active={tab === h.heatId} onClick={() => setTab(h.heatId)}>
              Заход {h.heatNumber}
            </TabButton>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        {visibleHeats.map((h) => (
          <div key={h.heatId} className="flex flex-col gap-1.5">
            {tab === "all" && showTabs && (
              <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-admin-disabled">Заход {h.heatNumber}</p>
            )}
            {h.items.map((item) => (
              <JudgeScoreButtons
                key={item.drawParticipantId}
                drawParticipantId={item.drawParticipantId}
                bibNumber={item.bibNumber}
                maxValue={item.maxValue}
                myScore={item.myScore}
                locked={confirmed}
              />
            ))}
          </div>
        ))}
      </div>

      {footer && <div className="sticky bottom-0 -mx-3 -mb-3 mt-1 border-t border-admin-border bg-admin-card px-3 py-2.5">{footer}</div>}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded-app-sm px-3 py-1.5 text-xs font-semibold transition-colors ${
        active ? "bg-admin-primary text-white shadow-sm" : "text-admin-muted hover:bg-admin-card2 hover:text-night-text"
      }`}
    >
      {children}
    </button>
  );
}
