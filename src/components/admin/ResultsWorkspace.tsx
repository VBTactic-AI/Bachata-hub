"use client";

import { type ReactNode, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { RoundStatus } from "@prisma/client";
import { setShallowQueryParams } from "@/lib/shallow-query";
import { ROUND_STATUS_LABELS } from "@/lib/competition-labels";
import { categoryDotColor } from "./category-colors";
import { CheckCircleIcon, JudgesIcon, TrophyIcon } from "./icons";
import { defaultCategoryId, defaultRoundId, resolveSelected } from "./monitor/selection";
import { RoundResultsList, type RoundResultRow } from "./RoundResultsList";
import { RoundScoreProtocol } from "./RoundScoreProtocol";

export type ResultsRound = {
  id: string;
  name: string;
  status: RoundStatus;
  // Финал — последний по order обычный (не служебный) раунд дивизиона (тот
  // же признак, что и isFinalRound в advancement.ts/page.tsx) — не отдельная
  // сущность, поэтому у него, как и у любого раунда, есть настоящий id.
  isFinalRound: boolean;
  // Есть ли смысл показывать протокол оценок судей этого этапа — то же
  // условие, что разрешает live "Монитор оценок судей" (score:view_all,
  // кроме перетанцовки "за место" без судейства, CLAUDE.md §12/§22): для
  // перетанцовки решение принимает HEAD_JUDGE вручную, оценок судей там нет.
  hasScoreProtocol: boolean;
  results: RoundResultRow[];
};

export type ResultsCategory = {
  id: string;
  name: string;
  rounds: ResultsRound[];
  // Официальный протокол дивизиона (DivisionResultsPanel) — виден только
  // когда финальный раунд завершён (тот же признак, что и в "Мониторе").
  resultsAvailable: boolean;
  results: ReactNode | null;
  finalResultsTable: ReactNode | null;
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

type ViewMode = "advancement" | "results" | "scores";

function SubTab({
  label,
  active,
  onClick,
  hidden,
  icon,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  hidden?: boolean;
  icon: ReactNode;
}) {
  if (hidden) return null;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-app-sm px-3 py-2 text-sm font-semibold transition-colors ${
        active ? "bg-admin-card2 text-night-text" : "text-admin-muted hover:text-night-text"
      }`}
    >
      <span aria-hidden="true">{icon}</span>
      {label}
    </button>
  );
}

// Единая вкладка "Результаты" (redesign 2026-09-09, по прямому запросу
// пользователя): слева категории (тот же приём, что и в JudgesWorkspace —
// цветная точка + имя), сверху этапы выбранной категории — под каждым свой
// протокол ("кто прошёл" / "оценки судей"), а на финальном этапе — тем же
// местом, официальный протокол мест и оценки судей по критериям
// (DivisionResultsPanel/FinalResultsTable, те же узлы, что раньше жили
// только в "Мониторе"). Здесь нет ни одного бизнес-правила (CLAUDE.md §48):
// кто прошёл, какие места, что считается финалом — уже решено на сервере,
// этот компонент только раскладывает уже готовые данные.
//
// "Результаты этапов"/"Результаты"/"Оценки судей" в "Мониторе" — прямые
// ссылки сюда же (?tab=results&category=&round=&view=), не дублируют
// контент отдельно.
export function ResultsWorkspace({ categories, publishPanel }: { categories: ResultsCategory[]; publishPanel?: ReactNode }) {
  const searchParams = useSearchParams();
  const fallbackCategoryId = defaultCategoryId(categories);
  const [categoryId, setCategoryId] = useState<string | null>(searchParams.get("category") ?? fallbackCategoryId);
  const [roundId, setRoundId] = useState<string | null>(searchParams.get("round"));
  const initialView = searchParams.get("view");
  const [view, setView] = useState<ViewMode | null>(
    initialView === "results" || initialView === "scores" || initialView === "advancement" ? initialView : null
  );

  const category = resolveSelected(categories, categoryId, fallbackCategoryId);
  if (!category) return <p className="text-sm text-admin-muted">Категорий пока нет.</p>;

  const round = resolveSelected(category.rounds, roundId, defaultRoundId(category.rounds));
  const defaultView: ViewMode = round?.isFinalRound ? "results" : "advancement";
  const activeView = view ?? defaultView;

  function selectCategory(id: string) {
    setCategoryId(id);
    setRoundId(null);
    setView(null);
    setShallowQueryParams({ category: id, round: null, view: null });
  }

  function selectRound(id: string) {
    setRoundId(id);
    setView(null);
    setShallowQueryParams({ round: id, view: null });
  }

  function selectView(mode: ViewMode) {
    setView(mode);
    setShallowQueryParams({ view: mode });
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      {/* ── Категории ─────────────────────────────────────────── */}
      <div className="w-full shrink-0 rounded-app border border-admin-border bg-admin-card sm:w-[240px]">
        <div
          className="flex gap-1 overflow-x-auto p-2 sm:flex-col sm:gap-0.5 sm:overflow-x-hidden"
          role="tablist"
          aria-label="Категории"
        >
          {categories.map((c, i) => {
            const isActive = c.id === category.id;
            return (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => selectCategory(c.id)}
                className={`flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-app-sm px-3 py-2.5 text-left text-sm transition-colors sm:w-full ${
                  isActive ? "bg-admin-primary/15 text-night-text" : "text-admin-muted hover:bg-admin-card2 hover:text-night-text"
                }`}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: categoryDotColor(i) }} aria-hidden="true" />
                <span className="flex-1 truncate font-medium sm:truncate">{c.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-4">
        {/* ── Этапы категории ───────────────────────────────────── */}
        {category.rounds.length === 0 ? (
          <p className="m-0 rounded-app border border-admin-border bg-admin-card p-4 text-sm text-admin-muted">
            У категории «{category.name}» ещё нет этапов.
          </p>
        ) : (
          <div
            className="flex items-stretch gap-1.5 overflow-x-auto rounded-app border border-admin-border bg-admin-card/50 p-1.5"
            role="tablist"
            aria-label="Этапы"
          >
            {category.rounds.map((r) => {
              const isActive = r.id === round?.id;
              const isCompleted = r.status === "COMPLETED";
              return (
                <button
                  key={r.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => selectRound(r.id)}
                  className={`flex min-w-[168px] shrink-0 flex-col gap-1.5 rounded-app border p-3.5 text-left transition-colors ${
                    isActive
                      ? "border-admin-primary bg-admin-primary/10"
                      : isCompleted
                        ? "border-night-success/30 bg-night-success/[0.07] hover:border-night-success/50"
                        : "border-admin-border bg-admin-card hover:border-admin-disabled"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    {isCompleted ? (
                      <span className="shrink-0 text-night-success" aria-hidden="true">
                        <CheckCircleIcon />
                      </span>
                    ) : (
                      <span className={`h-2 w-2 shrink-0 rounded-full ${ROUND_STATUS_TONE[r.status]}`} aria-hidden="true" />
                    )}
                    <span className={`text-sm font-bold ${isActive || isCompleted ? "text-night-text" : "text-admin-muted"}`}>
                      {r.name}
                    </span>
                    {r.isFinalRound && <span className="text-[11px] font-bold text-admin-violet">финал</span>}
                  </span>
                  <span
                    className={`text-[10.5px] font-bold uppercase tracking-wide ${isCompleted ? "text-night-success" : "text-admin-disabled"}`}
                  >
                    {ROUND_STATUS_LABELS[r.status] ?? r.status}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* ── Протокол выбранного этапа ─────────────────────────── */}
        {round && (
          <div key={round.id} className="flex flex-col gap-4">
            <div className="inline-flex w-fit gap-1 rounded-app-sm border border-admin-border bg-admin-card p-1">
              {round.isFinalRound ? (
                <>
                  <SubTab
                    label="Результаты"
                    icon={<TrophyIcon />}
                    active={activeView === "results"}
                    onClick={() => selectView("results")}
                  />
                  <SubTab
                    label="Оценки судей"
                    icon={<JudgesIcon />}
                    active={activeView === "scores"}
                    onClick={() => selectView("scores")}
                    hidden={!category.finalResultsTable}
                  />
                </>
              ) : (
                <>
                  <SubTab
                    label="Кто прошёл"
                    icon={<TrophyIcon />}
                    active={activeView === "advancement"}
                    onClick={() => selectView("advancement")}
                  />
                  <SubTab
                    label="Оценки судей"
                    icon={<JudgesIcon />}
                    active={activeView === "scores"}
                    onClick={() => selectView("scores")}
                    hidden={!round.hasScoreProtocol}
                  />
                </>
              )}
            </div>

            {round.isFinalRound ? (
              activeView === "scores" ? (
                category.finalResultsTable ? (
                  <section className="rounded-app border border-admin-border bg-admin-card p-[18px]">{category.finalResultsTable}</section>
                ) : (
                  <p className="m-0 text-sm text-admin-muted">Оценки судей по финалу ещё недоступны.</p>
                )
              ) : category.resultsAvailable ? (
                <div className="flex flex-col gap-4">
                  {category.results}
                  {publishPanel}
                </div>
              ) : (
                <p className="m-0 text-sm text-admin-muted">Финальный этап ещё не завершён — результатов пока нет.</p>
              )
            ) : activeView === "scores" ? (
              round.hasScoreProtocol ? (
                <section className="rounded-app border border-admin-border bg-admin-card p-[18px]">
                  <RoundScoreProtocol roundId={round.id} />
                </section>
              ) : (
                <p className="m-0 text-sm text-admin-muted">Для этого этапа судейского протокола нет.</p>
              )
            ) : round.status !== "COMPLETED" ? (
              <p className="m-0 text-sm text-admin-muted">Этап ещё не завершён — результатов пока нет.</p>
            ) : (
              <RoundResultsList results={round.results} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
