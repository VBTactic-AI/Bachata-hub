"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { DivisionJudgesPanel, type PoolJudge } from "@/components/admin/DivisionJudgesPanel";
import { DivisionJudgingSettingsForm, type FinalFormatValue } from "@/components/admin/DivisionJudgingSettingsForm";
import { categoryDotColor } from "@/components/admin/category-colors";

export type JudgingDivision = {
  id: string;
  categoryName: string;
  leaderJudgeUserIds: string[];
  followerJudgeUserIds: string[];
  judgingMaxScore: number;
  judgingMaxScoreDisabledReason: string | null;
  rotationMode: "TRACK_AUTO_SHIFT" | "SEGMENT_MANUAL_SHIFT";
  rotationIntervalSec: number;
  rotationShiftMin: number;
  rotationShiftMax: number;
  finalFormat: FinalFormatValue;
  finalFormatDisabledReason: string | null;
  finalTracksCount: number;
  finalPartnerChangeEnabled: boolean;
  finalConfig: unknown;
  finalCriteria: { id?: string; name: string; priority: number; minScore: number; maxScore: number; step: number; catalogId?: string | null }[];
  finalCriteriaCatalog: { id: string; name: string; minScore: number; maxScore: number; step: number }[];
};

// Цвет-точка категории в сайдбаре — чисто визуальный ориентир (по референсу
// пользователя, 2026-09-09), не токен темы и не поле в БД (у DivisionCategory
// нет цвета) — фиксированный набор, тот же приём, что PLACE_COLORS в
// FinalJudgingScreen.tsx (CLAUDE.md §64.4): назначается по порядку категорий,
// не должен меняться со сменой темы/страницы. Список общий с лентой категорий
// в "Мониторе" — одна категория должна быть одного цвета на обоих экранах.

// "Судейская панель" + "Настройки судейства" одной категории — общий сайдбар
// категорий на оба блока (по прямому выбору пользователя, 2026-09-09), по
// образцу референса: слева список категорий с цветной точкой и числом
// судей, справа — состав судей выбранной категории и её методики оценки.
// "Порядок судей" (drag-список из референса) сознательно не реализован — по
// прямому запросу пользователя, не нужен.
//
// Состав судей и методика/критерии разведены по подвкладкам (redesign
// 2026-09-09, по прямому запросу пользователя) — раньше это были две карточки
// в сетке 1fr/360px, и редактор критериев (поля "От/До/Шаг") в такой узкой
// колонке уже ломался. Подвкладка получает всю ширину рабочей области.
type DetailTab = "composition" | "settings";

export function JudgesWorkspace({ divisions, pool }: { divisions: JudgingDivision[]; pool: PoolJudge[] }) {
  const [selectedId, setSelectedId] = useState(divisions[0]?.id ?? "");
  const [tab, setTab] = useState<DetailTab>("composition");
  const selected = divisions.find((d) => d.id === selectedId) ?? divisions[0];
  if (!selected) return null;

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <div className="w-full shrink-0 rounded-app border border-admin-border bg-admin-card sm:w-[240px]">
        <div className="flex gap-1 overflow-x-auto p-2 sm:flex-col sm:gap-0.5 sm:overflow-x-hidden">
          {divisions.map((d, i) => {
            const count = d.leaderJudgeUserIds.length + d.followerJudgeUserIds.length;
            const active = d.id === selected.id;
            // Дисбаланс ролей (0 судей на партнёров или на партнёрш) —
            // предупреждение прямо в сайдбаре, не только внутри самой панели
            // категории (по запросу пользователя, 2026-09-09).
            const imbalanced = d.leaderJudgeUserIds.length === 0 || d.followerJudgeUserIds.length === 0;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => setSelectedId(d.id)}
                aria-current={active ? "true" : undefined}
                className={`flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-app-sm px-3 py-2.5 text-left text-sm transition-colors sm:w-full ${
                  active ? "bg-admin-primary/15 text-night-text" : "text-admin-muted hover:bg-admin-card2 hover:text-night-text"
                }`}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: categoryDotColor(i) }} aria-hidden="true" />
                <span className="flex-1 truncate font-medium sm:truncate">{d.categoryName}</span>
                {imbalanced && (
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-night-warning" title="Не хватает судей на одну из ролей" aria-hidden="true" />
                )}
                <span className="shrink-0 text-xs text-admin-disabled">{count} суд.</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="inline-flex w-fit gap-1 rounded-app-sm border border-admin-border bg-admin-card p-1">
          <button
            type="button"
            onClick={() => setTab("composition")}
            aria-current={tab === "composition" ? "true" : undefined}
            className={`rounded-app-sm px-3 py-2 text-sm font-semibold transition-colors ${
              tab === "composition" ? "bg-admin-card2 text-night-text" : "text-admin-muted hover:text-night-text"
            }`}
          >
            Состав судей
          </button>
          <button
            type="button"
            onClick={() => setTab("settings")}
            aria-current={tab === "settings" ? "true" : undefined}
            className={`rounded-app-sm px-3 py-2 text-sm font-semibold transition-colors ${
              tab === "settings" ? "bg-admin-card2 text-night-text" : "text-admin-muted hover:text-night-text"
            }`}
          >
            Методика и критерии
          </button>
        </div>

        {tab === "composition" ? (
          <Card className="border-admin-border bg-admin-card">
            <p className="m-0 mb-1 font-semibold text-night-text">Судейская панель</p>
            <p className="m-0 mb-3 text-sm text-admin-muted">Настройка состава судей для категории «{selected.categoryName}».</p>
            <DivisionJudgesPanel
              divisionId={selected.id}
              pool={pool}
              leaderJudgeUserIds={selected.leaderJudgeUserIds}
              followerJudgeUserIds={selected.followerJudgeUserIds}
            />
          </Card>
        ) : (
          <Card className="border-admin-border bg-admin-card">
            <p className="m-0 mb-1 font-semibold text-night-text">Настройки судейства</p>
            <p className="m-0 mb-3 text-sm text-admin-muted">Общие параметры, влияющие на работу судей и подсчёт результатов для «{selected.categoryName}».</p>
            <DivisionJudgingSettingsForm
              divisionId={selected.id}
              judgingMaxScore={selected.judgingMaxScore}
              judgingMaxScoreDisabledReason={selected.judgingMaxScoreDisabledReason}
              rotationMode={selected.rotationMode}
              rotationIntervalSec={selected.rotationIntervalSec}
              rotationShiftMin={selected.rotationShiftMin}
              rotationShiftMax={selected.rotationShiftMax}
              finalFormat={selected.finalFormat}
              finalFormatDisabledReason={selected.finalFormatDisabledReason}
              finalTracksCount={selected.finalTracksCount}
              finalPartnerChangeEnabled={selected.finalPartnerChangeEnabled}
              finalConfig={selected.finalConfig}
              finalCriteria={selected.finalCriteria}
              finalCriteriaCatalog={selected.finalCriteriaCatalog}
            />
          </Card>
        )}
      </div>
    </div>
  );
}
