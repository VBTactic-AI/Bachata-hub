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
    return <p className="hint-text">Пока нет вызванных участников вашей роли для оценки.</p>;
  }

  const current = items[Math.min(index, items.length - 1)];
  const currentSum = effectiveSum(current);
  const currentRank = ranked.findIndex((r) => r.drawParticipantId === current.drawParticipantId) + 1;

  return (
    <div className="stack gap-3">
      <div className="flex items-center justify-between gap-2">
        <strong>Оценено {scoredCount} / {items.length}</strong>
        <div className="flex gap-1">
          <Button type="button" size="sm" variant={tab === "score" ? "default" : "outline"} onClick={() => setTab("score")}>
            Оценка
          </Button>
          <Button type="button" size="sm" variant={tab === "rating" ? "default" : "outline"} onClick={() => setTab("rating")}>
            Мой рейтинг
          </Button>
        </div>
      </div>

      {tab === "score" && (
        <div className="rounded-app-md border border-line p-4 stack gap-3">
          <div>
            <p className="hint-text m-0">
              Участник №{current.bibNumber ?? "—"} · {current.role === "LEADER" ? "Ведущий" : "Ведомая"}
            </p>
            <p className="m-0 text-lg font-semibold">{current.displayName}</p>
          </div>

          {myCriteriaFor(current).map((c) => {
            const value = effectiveValue(current, c.id);
            const optionsCount = Math.floor((c.maxScore - c.minScore) / c.step) + 1;
            const useButtons = optionsCount <= 16;
            return (
              <div key={c.id}>
                <p className="hint-text m-0">{c.name}</p>
                {useButtons ? (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {Array.from({ length: optionsCount }, (_, i) => c.minScore + i * c.step).map((v) => (
                      <Button
                        key={v}
                        type="button"
                        size="sm"
                        variant={value === v ? "default" : "outline"}
                        onClick={() => enqueueFinalJudgeScore(current.drawParticipantId, c.id, v)}
                      >
                        {v}
                      </Button>
                    ))}
                  </div>
                ) : (
                  <input
                    type="number"
                    min={c.minScore}
                    max={c.maxScore}
                    step={c.step}
                    value={value ?? ""}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (Number.isFinite(v) && v >= c.minScore && v <= c.maxScore) {
                        enqueueFinalJudgeScore(current.drawParticipantId, c.id, v);
                      }
                    }}
                    className="mt-1 w-24 rounded-app-sm border border-line px-2 py-1"
                  />
                )}
              </div>
            );
          })}

          <div className="flex items-center justify-between border-t border-line pt-2">
            <div>
              <p className="hint-text m-0">МОЯ СУММА</p>
              <p className="m-0 text-2xl font-bold">{currentSum}</p>
            </div>
            <div className="text-right">
              <p className="hint-text m-0">МОЁ МЕСТО</p>
              <p className="m-0 text-2xl font-bold">#{currentRank}</p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <Button type="button" variant="outline" disabled={index === 0} onClick={() => setIndex((i) => Math.max(0, i - 1))}>
              ← Предыдущий
            </Button>
            <Button type="button" variant="outline" disabled={index >= items.length - 1} onClick={() => setIndex((i) => Math.min(items.length - 1, i + 1))}>
              Следующий →
            </Button>
          </div>
        </div>
      )}

      {tab === "rating" && (
        <div className="rounded-app-md border border-line p-3">
          <p className="hint-text m-0 mb-2">Мой рейтинг — не является официальным результатом соревнования.</p>
          <ol className="stack gap-1 m-0 pl-4">
            {ranked.map((r) => (
              <li key={r.drawParticipantId}>
                №{r.bibNumber ?? "—"} {r.displayName} — {effectiveSum(r)}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
