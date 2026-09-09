"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import type { RoundStatus } from "@prisma/client";
import { setShallowQueryParams } from "@/lib/shallow-query";
import { ROUND_STATUS_LABELS } from "@/lib/competition-labels";
import { CheckCircleIcon } from "./icons";
import { RoundResultsList, type RoundResultRow } from "./RoundResultsList";

export type RoundResultsRound = {
  id: string;
  name: string;
  status: RoundStatus;
  isFinalRound: boolean;
  results: RoundResultRow[];
};

const ROUND_STATUS_TONE: Record<RoundStatus, string> = {
  DRAFT: "bg-admin-disabled",
  READY: "bg-admin-disabled",
  DRAWING: "bg-admin-primaryHover",
  DRAW_LOCKED: "bg-admin-primaryHover",
  RUNNING: "bg-night-success",
  PAUSED: "bg-night-warning",
  FINISHED: "bg-admin-primaryHover",
  SCORING: "bg-night-warning",
  COMPLETED: "bg-night-success",
};

// Вкладки этапов категории на отдельной странице "Результаты этапов"
// (redesign 2026-09-09, по прямому запросу пользователя) — тот же принцип
// выбора, что и в CompetitionMonitor.tsx (клик пишет query-параметр в обход
// роутера, F5 возвращает на ту же вкладку), но не привязан к самому
// Монитору: у страницы нет ни заходов, ни жеребьёвки, ни судейских панелей —
// только протокол "прошёл/не прошёл" по каждому завершённому этапу.
export function RoundResultsTabs({ rounds }: { rounds: RoundResultsRound[] }) {
  const searchParams = useSearchParams();
  const urlRound = searchParams.get("round");
  const initial = (urlRound && rounds.some((r) => r.id === urlRound) ? urlRound : rounds[0]?.id) ?? null;
  const [activeId, setActiveId] = useState(initial);

  function select(id: string) {
    setActiveId(id);
    setShallowQueryParams({ round: id });
  }

  const active = rounds.find((r) => r.id === activeId) ?? null;

  if (rounds.length === 0) {
    return <p className="m-0 text-sm text-admin-muted">У категории пока нет этапов.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1.5 overflow-x-auto rounded-app border border-admin-border bg-admin-card/50 p-1.5" role="tablist" aria-label="Этапы">
        {rounds.map((r) => {
          const isActive = r.id === active?.id;
          const isCompleted = r.status === "COMPLETED";
          return (
            <button
              key={r.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => select(r.id)}
              className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-app-sm border px-3.5 py-2 text-sm font-semibold transition-colors ${
                isActive
                  ? "border-admin-primary bg-admin-primary/10 text-night-text"
                  : isCompleted
                    ? "border-night-success/30 bg-night-success/[0.07] text-night-text hover:border-night-success/50"
                    : "border-transparent text-admin-muted hover:bg-admin-card2 hover:text-night-text"
              }`}
            >
              {isCompleted ? (
                <span className="shrink-0 text-night-success" aria-hidden="true">
                  <CheckCircleIcon />
                </span>
              ) : (
                <span className={`h-2 w-2 shrink-0 rounded-full ${ROUND_STATUS_TONE[r.status]}`} aria-hidden="true" />
              )}
              {r.name}
              {r.isFinalRound && <span className="text-[11px] font-bold text-admin-violet">финал</span>}
            </button>
          );
        })}
      </div>

      {active && (
        <div key={active.id} className="rounded-app border border-admin-border bg-admin-card p-[18px]">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h3 className="m-0 text-base font-extrabold text-night-text">{active.name}</h3>
            <span className="rounded-full border border-admin-border px-2.5 py-1 text-xs font-semibold text-admin-muted">
              {ROUND_STATUS_LABELS[active.status] ?? active.status}
            </span>
          </div>
          {active.status !== "COMPLETED" ? (
            <p className="m-0 text-sm text-admin-muted">Этап ещё не завершён — результатов пока нет.</p>
          ) : active.isFinalRound ? (
            <p className="m-0 text-sm text-admin-muted">
              Финал считается отдельно — протокол мест смотрите на вкладке «Результаты» в Мониторе.
            </p>
          ) : (
            <RoundResultsList results={active.results} />
          )}
        </div>
      )}
    </div>
  );
}
