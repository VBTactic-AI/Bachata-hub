"use client";

import { useState } from "react";
import { categoryDotColor } from "@/components/admin/category-colors";
import { AudienceVotePanel } from "./AudienceVotePanel";

export type AudienceVoteDivision = { id: string; categoryName: string };

// Список категорий слева + панель настроек/результатов выбранной справа —
// тот же приём, что уже используется в "Судьях" (JudgesWorkspace.tsx) и
// "Результатах" (ResultsWorkspace.tsx), по прямому запросу пользователя
// (2026-09-11: "как и везде слева табличка с категориями"). В отличие от
// прежней версии (все категории одна под другой), здесь видна только одна
// панель за раз — key={selected.id} на AudienceVotePanel гарантирует, что
// её внутреннее состояние (форма настроек, загруженный тираж) полностью
// сбрасывается при переключении категории, а не тянет данные предыдущей.
export function AudienceVoteWorkspace({ divisions }: { divisions: AudienceVoteDivision[] }) {
  const [selectedId, setSelectedId] = useState(divisions[0]?.id ?? "");
  const selected = divisions.find((d) => d.id === selectedId) ?? divisions[0];
  if (!selected) return null;

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <div className="w-full shrink-0 rounded-app border border-admin-border bg-admin-card sm:w-[240px]">
        <div className="flex gap-1 overflow-x-auto p-2 sm:flex-col sm:gap-0.5 sm:overflow-x-hidden">
          {divisions.map((d, i) => {
            const active = d.id === selected.id;
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
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <AudienceVotePanel key={selected.id} divisionId={selected.id} categoryName={selected.categoryName} />
      </div>
    </div>
  );
}
