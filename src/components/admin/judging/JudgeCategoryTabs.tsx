"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { LiveDot } from "@/components/LiveDot";

export type JudgeStageStatus = "NOT_STARTED" | "CURRENT" | "DONE";

export type JudgeStageTab = {
  roundId: string;
  label: string;
  status: JudgeStageStatus;
  // Уже отрендеренное на сервере содержимое вкладки (доска обычного раунда
  // или FinalJudgingScreen) — этот компонент только переключает видимость,
  // сам ничего не считает (CLAUDE.md §48).
  content: ReactNode;
};

export type JudgeCategoryTab = {
  divisionId: string;
  categoryName: string;
  stages: JudgeStageTab[];
};

// Категория (вкладка) → этап (вкладка) → сама оценка — всё на одной
// странице, без переходов (2026-09-10, редизайн навигации судьи по прямому
// запросу пользователя; тот же приём, что и вкладки заходов JUDGES_DANCE,
// JudgesDanceDrawPanel.tsx/FinalJudgingScreen.tsx — локальное состояние, без
// синхронизации с URL, judging/layout.tsx намеренно без чужой навигационной
// обвязки). По умолчанию открыт этап со статусом "идёт" — если такого нет,
// последний по порядку (обычно ближайший к текущему моменту).
function pickDefaultStage(stages: JudgeStageTab[]): string | null {
  const current = stages.find((s) => s.status === "CURRENT");
  if (current) return current.roundId;
  return stages.length > 0 ? stages[stages.length - 1].roundId : null;
}

export function JudgeCategoryTabs({ categories }: { categories: JudgeCategoryTab[] }) {
  const [activeDivisionId, setActiveDivisionId] = useState<string | null>(categories[0]?.divisionId ?? null);
  const [activeRoundByDivision, setActiveRoundByDivision] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(categories.map((c) => [c.divisionId, pickDefaultStage(c.stages)]))
  );

  const activeCategory = categories.find((c) => c.divisionId === activeDivisionId) ?? categories[0] ?? null;
  if (!activeCategory) return null;
  const activeRoundId = activeRoundByDivision[activeCategory.divisionId] ?? pickDefaultStage(activeCategory.stages);
  const activeStage = activeCategory.stages.find((s) => s.roundId === activeRoundId) ?? null;

  return (
    <div className="flex flex-col gap-3">
      {categories.length > 1 && (
        <div role="tablist" aria-label="Категории" className="flex gap-1.5 overflow-x-auto rounded-app-sm border border-admin-border bg-admin-card2/60 p-1.5">
          {categories.map((c) => {
            const isActive = c.divisionId === activeCategory.divisionId;
            const hasCurrent = c.stages.some((s) => s.status === "CURRENT");
            return (
              <button
                key={c.divisionId}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveDivisionId(c.divisionId)}
                className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-app-sm px-3.5 py-2 text-sm font-semibold transition-colors ${
                  isActive ? "bg-admin-primary text-white" : "text-admin-muted hover:bg-admin-card hover:text-night-text"
                }`}
              >
                {c.categoryName}
                {hasCurrent && <span className="text-[11px] font-bold text-night-success">идёт</span>}
              </button>
            );
          })}
        </div>
      )}

      {activeCategory.stages.length === 0 ? (
        <p className="m-0 text-sm text-admin-muted">Для этой категории пока нет ни одного этапа.</p>
      ) : (
        <>
          <div role="tablist" aria-label="Этапы" className="flex gap-1 overflow-x-auto rounded-app-sm border border-admin-border bg-admin-bg/60 p-1">
            {activeCategory.stages.map((s) => {
              const isActive = s.roundId === activeStage?.roundId;
              return (
                <button
                  key={s.roundId}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveRoundByDivision((prev) => ({ ...prev, [activeCategory.divisionId]: s.roundId }))}
                  className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-app-sm px-3 py-1.5 text-xs font-semibold transition-colors ${
                    isActive ? "bg-admin-primary text-white shadow-sm" : "text-admin-muted hover:bg-admin-card2 hover:text-night-text"
                  }`}
                >
                  {s.label}
                  {s.status === "DONE" && <span aria-hidden="true">✓</span>}
                  {s.status === "CURRENT" && <LiveDot className="h-1.5 w-1.5" />}
                </button>
              );
            })}
          </div>

          {activeStage && <div key={activeStage.roundId}>{activeStage.content}</div>}
        </>
      )}
    </div>
  );
}
