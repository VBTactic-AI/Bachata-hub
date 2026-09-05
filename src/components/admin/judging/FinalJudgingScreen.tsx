"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  enqueueFinalJudgeScore,
  getQueuedFinalScore,
  subscribeFinalJudgeScoreQueue,
} from "@/components/admin/judging/final-judge-score-queue";

export type FinalCriterionInfo = { id: string; name: string; priority: number; minScore: number; maxScore: number; step: number };
export type FinalQueueItem = {
  drawParticipantId: string;
  role: "LEADER" | "FOLLOWER";
  bibNumber: string | null;
  displayName: string;
  scores: Record<string, number | null>;
  // Какие критерии ЭТОТ судья вправе оценивать у ЭТОГО участника — в
  // NORMAL/RANDOM_COUPLES всегда все критерии; в JUDGES_DANCE подмножество
  // ("танцующий"/сторонний судья видят разные критерии, final-scoring-matrix.ts).
  criteriaIds: string[];
};

// Судейский экран финала (CLAUDE.md §40 — быстро, без админских функций;
// промт пользователя, п.40-41): один участник на экране, критерии подряд,
// "ИТОГО"/"МОЕ МЕСТО" пересчитываются мгновенно при любом клике. Отправка —
// через офлайн-очередь (final-judge-score-queue.ts, тот же приём, что и в
// обычных раундах, CLAUDE.md §17): клик сохраняет локально и пытается
// отправить сразу, без связи — досылается сама.
export function FinalJudgingScreen({
  criteria,
  items,
}: {
  criteria: FinalCriterionInfo[];
  items: FinalQueueItem[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"score" | "rating">("score");
  const [index, setIndex] = useState(0);
  // Реактивный тик — просто чтобы перерисоваться, когда очередь меняется
  // (эффективные значения читаются заново из очереди/пропсов при рендере).
  const [, setTick] = useState(0);
  // Как только очередь ДОСТАВИЛА оценку (ключ пропал из очереди без ошибки),
  // серверные props (items) устарели — без router.refresh() "МОЯ СУММА"
  // откатилась бы к старому значению из первоначального рендера, как только
  // локальная очередь опустеет (баг, найденный вживую 2026-09-04: сумма
  // визуально обнулялась после отправки всех критериев, хотя в БД всё
  // сохранялось верно). Тот же приём, что и в JudgeScoreButtons.tsx.
  const pendingKeysRef = useRef<Set<string>>(new Set());
  // UX-002: очередь и раньше отслеживала реальные (не сетевые) ошибки
  // отправки — но этот экран нигде их не показывал, в отличие от
  // JudgeScoreButtons.tsx (обычные раунды). Судья видел, что кнопка просто
  // "откатилась" без единого объяснения, будто ничего и не нажимал.
  const [errorsByKey, setErrorsByKey] = useState<Record<string, string>>({});

  useEffect(() => {
    return subscribeFinalJudgeScoreQueue((state) => {
      const relevantIds = new Set(items.map((it) => it.drawParticipantId));
      const currentKeys = new Set(
        state.queue.filter((q) => relevantIds.has(q.drawParticipantId)).map((q) => `${q.drawParticipantId}:${q.criterionId}`)
      );
      let delivered = false;
      for (const k of pendingKeysRef.current) {
        if (!currentKeys.has(k) && !state.errors[k]) delivered = true;
      }
      pendingKeysRef.current = currentKeys;
      setErrorsByKey(Object.fromEntries(Object.entries(state.errors).filter(([k]) => relevantIds.has(k.split(":")[0]))));
      setTick((t) => t + 1);
      if (delivered) router.refresh();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const sortedCriteria = useMemo(() => [...criteria].sort((a, b) => a.priority - b.priority), [criteria]);

  function effectiveValue(item: FinalQueueItem, criterionId: string): number | null {
    const pending = getQueuedFinalScore(item.drawParticipantId, criterionId);
    if (pending) return pending.value;
    return item.scores[criterionId] ?? null;
  }

  function myCriteriaFor(item: FinalQueueItem): FinalCriterionInfo[] {
    return sortedCriteria.filter((c) => item.criteriaIds.includes(c.id));
  }

  function effectiveSum(item: FinalQueueItem): number {
    return myCriteriaFor(item).reduce((sum, c) => sum + (effectiveValue(item, c.id) ?? 0), 0);
  }

  function isFullyScored(item: FinalQueueItem): boolean {
    const mine = myCriteriaFor(item);
    return mine.length > 0 && mine.every((c) => effectiveValue(item, c.id) !== null);
  }

  const scoredCount = items.filter(isFullyScored).length;

  // Локальный рейтинг ЭТОГО судьи — сумма DESC, при равенстве сумма по
  // критерию приоритета #1, затем #2 и т.д. (тот же порядок сравнения, что
  // и в official ranking engine, только чисто на клиенте для подсказки судье
  // — промт пользователя, п.5: "не является официальным рейтингом").
  const ranked = useMemo(() => {
    return [...items].sort((a, b) => {
      const sa = effectiveSum(a);
      const sb = effectiveSum(b);
      if (sa !== sb) return sb - sa;
      for (const c of sortedCriteria) {
        const av = effectiveValue(a, c.id) ?? 0;
        const bv = effectiveValue(b, c.id) ?? 0;
        if (av !== bv) return bv - av;
      }
      return 0;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, sortedCriteria]);

  if (items.length === 0) {
    return <p className="text-sm text-night-muted">Пока нет вызванных участников вашей роли для оценки.</p>;
  }

  const current = items[Math.min(index, items.length - 1)];
  const currentSum = effectiveSum(current);
  const currentRank = ranked.findIndex((r) => r.drawParticipantId === current.drawParticipantId) + 1;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1 rounded-app bg-night-card p-4">
        <p className="m-0 text-xs font-semibold uppercase tracking-wide text-night-muted">
          Пара {index + 1} из {items.length} · оценено {scoredCount}
        </p>
        <p className="m-0 text-lg font-bold text-night-text">
          №{current.bibNumber ?? "—"} {current.displayName} · {current.role === "LEADER" ? "Ведущий" : "Ведомая"}
        </p>
      </div>

      <div className="flex gap-2 rounded-full bg-night-card p-1">
        <button
          type="button"
          onClick={() => setTab("score")}
          className={`flex-1 rounded-full py-2 font-night text-sm font-semibold transition-colors ${tab === "score" ? "bg-gradient-night-cta text-white" : "text-night-muted"}`}
        >
          Оценка
        </button>
        <button
          type="button"
          onClick={() => setTab("rating")}
          className={`flex-1 rounded-full py-2 font-night text-sm font-semibold transition-colors ${tab === "rating" ? "bg-gradient-night-cta text-white" : "text-night-muted"}`}
        >
          Мой рейтинг
        </button>
      </div>

      {tab === "score" && (
        <div className="flex flex-col gap-3">
          {myCriteriaFor(current).map((c) => {
            const value = effectiveValue(current, c.id);
            const criterionError = errorsByKey[`${current.drawParticipantId}:${c.id}`];
            const canDec = value !== null && value - c.step >= c.minScore;
            const canInc = value === null ? true : value + c.step <= c.maxScore;
            return (
              <div key={c.id} className="flex items-center gap-3 rounded-app bg-night-card p-4">
                <div className="min-w-0 flex-1">
                  <p className="m-0 text-[0.95rem] font-semibold text-night-text">{c.name}</p>
                  <p className="m-0 text-xs text-night-muted">
                    {c.minScore}–{c.maxScore}
                  </p>
                  {criterionError && <p className="m-0 mt-1 text-xs text-red-400">{criterionError}</p>}
                </div>
                <button
                  type="button"
                  disabled={!canDec}
                  onClick={() => enqueueFinalJudgeScore(current.drawParticipantId, c.id, Math.max(c.minScore, (value ?? c.minScore) - c.step))}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-app-sm border border-night-border bg-night-card2 text-xl text-night-text disabled:opacity-30"
                >
                  −
                </button>
                <span className="w-9 shrink-0 text-center text-xl font-bold text-night-text">{value ?? "–"}</span>
                <button
                  type="button"
                  disabled={!canInc}
                  onClick={() => enqueueFinalJudgeScore(current.drawParticipantId, c.id, Math.min(c.maxScore, (value ?? c.minScore) + c.step))}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-app-sm border border-night-border bg-night-card2 text-xl text-night-text disabled:opacity-30"
                >
                  +
                </button>
              </div>
            );
          })}

          <div className="flex items-center justify-between px-1">
            <div>
              <p className="m-0 text-xs uppercase tracking-wide text-night-muted">Моя сумма</p>
              <p className="m-0 text-2xl font-bold text-night-text">{currentSum}</p>
            </div>
            <div className="text-right">
              <p className="m-0 text-xs uppercase tracking-wide text-night-muted">Моё место</p>
              <p className="m-0 text-2xl font-bold text-night-primary">#{currentRank}</p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={index === 0}
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              className="border-night-border bg-transparent text-night-text hover:bg-night-card2"
            >
              ← Предыдущий
            </Button>
            <Button
              type="button"
              disabled={index >= items.length - 1}
              onClick={() => setIndex((i) => Math.min(items.length - 1, i + 1))}
              className="border-none bg-gradient-night-cta"
            >
              Следующий →
            </Button>
          </div>
        </div>
      )}

      {tab === "rating" && (
        <div className="rounded-app bg-night-card p-4">
          <p className="m-0 mb-3 text-sm text-night-muted">Мой рейтинг — не является официальным результатом соревнования.</p>
          <ol className="m-0 flex list-none flex-col gap-2 p-0">
            {ranked.map((r, i) => (
              <li key={r.drawParticipantId} className="flex items-center justify-between gap-2 rounded-app-sm bg-night-card2 px-3 py-2.5 text-sm">
                <span className="text-night-text">
                  #{i + 1} · №{r.bibNumber ?? "—"} {r.displayName}
                </span>
                <span className="font-bold text-night-primary">{effectiveSum(r)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
