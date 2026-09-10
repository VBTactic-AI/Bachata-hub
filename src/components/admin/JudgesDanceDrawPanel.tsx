"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { HeatStatus, RoundStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { HEAT_STATUS_LABELS } from "@/lib/competition-labels";
import { HeatStatusControls } from "./HeatStatusControls";
import { RemoveDrawHelperButton } from "./RemoveDrawHelperButton";
import { AddJudgesDanceHelperForm } from "./AddJudgesDanceHelperForm";
import { PersonIcon, JudgesIcon } from "./icons";

export type JudgesDanceHeatView = {
  id: string;
  number: number;
  status: HeatStatus;
  roleLabel: string; // "Партнёры" | "Партнёрши" — танцующая роль ЭТОГО захода
  judgeRole: "LEADER" | "FOLLOWER"; // роль судей/помощников — противоположная roleLabel
  finalists: { id: string; bibNumber: string | null; displayName: string }[];
  realJudges: { id: string; displayName: string }[];
  helpers: { id: string; bibNumber: string | null; displayName: string; sourceLabel: string }[];
};

const HEAT_STATUS_TONE: Record<HeatStatus, string> = {
  PENDING: "bg-admin-disabled",
  RUNNING: "bg-night-success",
  PAUSED: "bg-night-warning",
  FINISHED: "bg-admin-primaryHover",
};

// Замена JudgesDanceStagePanel + read-only списка стадий (2026-09-10, по
// прямому запросу пользователя): заходы JUDGES_DANCE формируются и
// отображаются в том же стиле, что и обычная жеребьёвка (CLAUDE.md §64) —
// карточка с вкладками заходов и двумя колонками. Отличие от обычного
// HeatPanel только в правой колонке: там не другие финалисты, а реальные
// назначенные судьи противоположной роли (без номера, только ФИО) и, если их
// не хватает физически на всех финалистов захода, судьи-помощники
// (DrawParticipant scored=false, тот же смысл, что и обычный "помощник").
export function JudgesDanceDrawPanel({
  roundId,
  roundStatus,
  heats,
  canGenerateNextStage,
  nextStageLabel,
}: {
  roundId: string;
  roundStatus: RoundStatus;
  heats: JudgesDanceHeatView[];
  canGenerateNextStage: boolean;
  nextStageLabel: string | null;
}) {
  const router = useRouter();
  const [activeHeatId, setActiveHeatId] = useState<string | null>(heats[heats.length - 1]?.id ?? null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = heats.find((h) => h.id === activeHeatId) ?? heats[heats.length - 1] ?? null;

  async function generateStage() {
    setGenerating(true);
    setError(null);
    const res = await fetch(`/api/rounds/${roundId}/judges-dance-advance`, { method: "POST" });
    setGenerating(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось сформировать список.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {heats.length === 0 ? (
        <p className="m-0 text-sm text-admin-muted">Заходов пока нет.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {heats.length > 1 && (
            <div className="flex items-center gap-1.5 overflow-x-auto rounded-app-sm bg-admin-card2/50 p-1.5" role="tablist" aria-label="Заходы">
              {heats.map((h) => {
                const isActive = h.id === active?.id;
                return (
                  <button
                    key={h.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setActiveHeatId(h.id)}
                    className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-app-sm px-3.5 py-2 text-[13px] font-semibold transition-colors ${
                      isActive ? "bg-admin-primary text-white" : "text-admin-muted hover:bg-admin-card2 hover:text-night-text"
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${isActive ? "bg-white" : HEAT_STATUS_TONE[h.status]}`} aria-hidden="true" />
                    Заход {h.number}
                  </button>
                );
              })}
            </div>
          )}

          {active && (
            <div key={active.id} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-admin-card2 px-2.5 py-1 text-xs font-bold text-night-text">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${HEAT_STATUS_TONE[active.status]}`} aria-hidden="true" />
                  {HEAT_STATUS_LABELS[active.status] ?? active.status}
                </span>
                <span className="ml-auto">
                  <HeatStatusControls heatId={active.id} status={active.status} roundStatus={roundStatus} />
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col rounded-app border border-admin-border bg-admin-card2">
                  <div className="flex items-center gap-2 border-b border-admin-border px-3.5 py-3">
                    <span className="text-[#60a5fa]" aria-hidden="true">
                      <PersonIcon />
                    </span>
                    <h4 className="m-0 text-[13px] font-extrabold uppercase tracking-wide text-night-text">{active.roleLabel}</h4>
                    <span className="ml-auto text-xl font-extrabold tabular-nums leading-none text-[#60a5fa]">{active.finalists.length}</span>
                  </div>
                  {active.finalists.length === 0 ? (
                    <p className="m-0 px-3.5 py-3 text-sm text-admin-muted">Пусто.</p>
                  ) : (
                    <ul className="m-0 flex list-none flex-col gap-1 p-2">
                      {active.finalists.map((p) => (
                        <li key={p.id} className="flex items-center gap-x-3 rounded-app-sm px-2 py-1.5">
                          <span className="grid h-9 min-w-[48px] shrink-0 place-items-center rounded-app-sm border border-admin-border bg-admin-bg/70 text-base font-extrabold tabular-nums text-[#60a5fa]">
                            {p.bibNumber ?? "—"}
                          </span>
                          <span className="truncate text-sm font-semibold text-night-text">{p.displayName}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="flex flex-col rounded-app border border-admin-border bg-admin-card2">
                  <div className="flex items-center gap-2 border-b border-admin-border px-3.5 py-3">
                    <span className="text-[#f472b6]" aria-hidden="true">
                      <JudgesIcon />
                    </span>
                    <h4 className="m-0 text-[13px] font-extrabold uppercase tracking-wide text-night-text">Судьи</h4>
                    <span className="ml-auto text-xl font-extrabold tabular-nums leading-none text-[#f472b6]">
                      {active.realJudges.length + active.helpers.length}
                    </span>
                  </div>
                  {active.realJudges.length === 0 && active.helpers.length === 0 ? (
                    <p className="m-0 px-3.5 py-3 text-sm text-admin-muted">Судьи не назначены.</p>
                  ) : (
                    <ul className="m-0 flex list-none flex-col gap-1 p-2">
                      {active.realJudges.map((j) => (
                        <li key={j.id} className="flex items-center gap-x-3 rounded-app-sm px-2 py-1.5">
                          <span className="grid h-9 min-w-[48px] shrink-0 place-items-center rounded-app-sm border border-admin-border bg-admin-bg/70 text-[11px] font-bold uppercase text-admin-disabled">
                            судья
                          </span>
                          <span className="truncate text-sm font-semibold text-night-text">{j.displayName}</span>
                        </li>
                      ))}
                      {active.helpers.map((p) => (
                        <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-app-sm px-2 py-1.5">
                          <span className="grid h-9 min-w-[48px] shrink-0 place-items-center rounded-app-sm border border-admin-border bg-admin-bg/70 text-base font-extrabold tabular-nums text-[#f472b6]">
                            {p.bibNumber ?? "—"}
                          </span>
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate text-sm font-semibold text-night-text">{p.displayName}</span>
                            <span className="truncate text-[11px] text-admin-disabled">{p.sourceLabel}</span>
                          </span>
                          <span className="shrink-0 rounded-full bg-night-warning/15 px-2 py-0.5 text-[10px] font-bold text-night-warning">помощник</span>
                          {active.status === "PENDING" && <RemoveDrawHelperButton participantId={p.id} heatId={active.id} role={active.judgeRole} />}
                        </li>
                      ))}
                    </ul>
                  )}
                  {active.status === "PENDING" &&
                    (() => {
                      // Кнопка "+ Судья на помощь" — только пока реально не
                      // хватает (судей+помощников меньше, чем финалистов в
                      // заходе), тем же правилом, что и обычная жеребьёвка
                      // (SideColumn/AddDrawHelperForm, isNeeded). Раньше
                      // показывалась всегда, пока заход PENDING — даже когда
                      // авто-каскад при формировании списка уже добрал ровно
                      // столько, сколько нужно (найдено по жалобе
                      // пользователя, 2026-09-10, скриншот "6/6, а кнопка
                      // всё равно есть").
                      const deficit = active.finalists.length - (active.realJudges.length + active.helpers.length);
                      return deficit > 0 ? (
                        <div className="mt-auto flex flex-wrap items-center gap-2.5 border-t border-admin-border px-3.5 py-2.5 text-xs">
                          <span className="font-semibold text-night-warning">Не хватает: {deficit}</span>
                          <span className="ml-auto">
                            <AddJudgesDanceHelperForm heatId={active.id} roleLabel={active.roleLabel} />
                          </span>
                        </div>
                      ) : (
                        <div className="mt-auto border-t border-admin-border px-3.5 py-2.5 text-xs text-admin-muted">Хватает судей</div>
                      );
                    })()}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {canGenerateNextStage && (
        <div className="flex flex-wrap items-center gap-3 border-t border-admin-border pt-4">
          <Button type="button" size="sm" variant="admin" disabled={generating} onClick={generateStage}>
            Сформировать список{nextStageLabel ? ` (${nextStageLabel})` : ""}
          </Button>
          {error && <span className="text-sm text-red-400">{error}</span>}
        </div>
      )}
    </div>
  );
}
