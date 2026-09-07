"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmJudgingButton } from "@/components/admin/ConfirmJudgingButton";
import {
  enqueueFinalJudgeScore,
  getQueuedFinalScore,
  subscribeFinalJudgeScoreQueue,
} from "@/components/admin/judging/final-judge-score-queue";

export type FinalCriterionInfo = { id: string; name: string; priority: number; minScore: number; maxScore: number; step: number };

// Цвета мест для RELATIVE_PLACEMENT (скейтинг) — по бренд-палитре "night"
// (tailwind.config.ts: primary/success — остальное подобрано в тон, чтобы
// вписаться в тёмную тему раздела /judging). Индекс 5 (жёлтый) — единственный,
// которому нужен тёмный текст вместо белого.
const PLACE_COLORS = ["#ff2d8a", "#37d67a", "#a78bfa", "#fb923c", "#22d3ee", "#facc15", "#ff9ac9", "#94a3b8"];
function placeColor(place: number): string {
  return PLACE_COLORS[(place - 1) % PLACE_COLORS.length];
}
function placeTextColor(place: number): string {
  return (place - 1) % PLACE_COLORS.length === 5 ? "#241c00" : "#ffffff";
}
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
  roundId,
  format,
  criteria,
  items,
  confirmed,
}: {
  roundId: string;
  format: "NORMAL" | "JUDGES_DANCE" | "RANDOM_COUPLES" | "RELATIVE_PLACEMENT";
  criteria: FinalCriterionInfo[];
  items: FinalQueueItem[];
  // Судья уже нажал "Готово" по этому финалу (confirmFinalJudgeRoundDone) —
  // оценки зафиксированы, кнопки редактирования блокируются (2026-09-07, по
  // образцу обычных раундов, JudgeScoreButtons.tsx).
  confirmed: boolean;
}) {
  // RELATIVE_PLACEMENT (скейтинг-система) — судья вводит МЕСТО (меньше
  // лучше), а не баллы (больше лучше) — единственный критерий формата.
  // "Мой рейтинг"/"моя сумма" ниже — чисто клиентская подсказка судье (как и
  // для остальных форматов, промт пользователя п.5), но направление
  // сравнения должно быть развёрнуто, иначе подсказка была бы буквально
  // задом наперёд (участник с местом "6" показывался бы как лучший).
  const lowerIsBetter = format === "RELATIVE_PLACEMENT";
  const router = useRouter();
  const [tab, setTab] = useState<"score" | "rating">("score");
  const [index, setIndex] = useState(0);
  // Открытая карточка выбора места (скейтинг) — id участника, для которого
  // сейчас показан лист с местами 1..N, либо null, если лист закрыт.
  const [placeSheetFor, setPlaceSheetFor] = useState<string | null>(null);
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
  // Дебаунс router.refresh(), а не вызов на каждую доставленную оценку —
  // при догоне очереди после офлайна несколько критериев/участников
  // доставляются подряд, каждый через отдельное состояние очереди; без
  // дебаунса это была бы серия последовательных RSC-рефетчей одной и той же
  // страницы (тот же шторм, что и в JudgeScoreButtons.tsx, 2026-09-07).
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
      if (delivered) {
        if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = setTimeout(() => router.refresh(), 400);
      }
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
    const sign = lowerIsBetter ? -1 : 1;
    return [...items].sort((a, b) => {
      const sa = effectiveSum(a);
      const sb = effectiveSum(b);
      if (sa !== sb) return (sb - sa) * sign;
      for (const c of sortedCriteria) {
        const av = effectiveValue(a, c.id) ?? 0;
        const bv = effectiveValue(b, c.id) ?? 0;
        if (av !== bv) return (bv - av) * sign;
      }
      return 0;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, sortedCriteria, lowerIsBetter]);

  if (items.length === 0) {
    return <p className="text-sm text-night-muted">Пока нет вызванных участников вашей роли для оценки.</p>;
  }

  const current = items[Math.min(index, items.length - 1)];
  const currentSum = effectiveSum(current);
  const currentRank = ranked.findIndex((r) => r.drawParticipantId === current.drawParticipantId) + 1;

  // RELATIVE_PLACEMENT — вместо табов "Оценка"/"Мой рейтинг" со сквозным
  // пролистыванием одного участника за раз, судья видит сразу весь список
  // своей роли с местом рядом с каждым (промт пользователя, 2026-09-07:
  // "место отображается сразу, чтобы всегда было перед глазами"). Формат
  // гарантированно имеет ровно один критерий (FinalSettingsPanel.tsx,
  // валидация "требует ровно один критерий") — это он и есть.
  const placementCriterion = format === "RELATIVE_PLACEMENT" ? sortedCriteria[0] : undefined;

  function placeOf(item: FinalQueueItem): number | null {
    return placementCriterion ? effectiveValue(item, placementCriterion.id) : null;
  }
  // Места уникальны в пределах РОЛИ (final-scoring.ts: sameRoleIds), не
  // глобально — Leaders и Followers судятся раздельными пулами (CLAUDE.md §5).
  function roleGroup(role: "LEADER" | "FOLLOWER") {
    return items.filter((it) => it.role === role);
  }
  function holderAtPlace(role: "LEADER" | "FOLLOWER", place: number, excludeId: string) {
    return roleGroup(role).find((it) => it.drawParticipantId !== excludeId && placeOf(it) === place);
  }
  // Переставить участника на свободное место — идёт через ту же офлайн-очередь
  // (final-judge-score-queue.ts), что и обычная оценка: один PATCH-по-сути на
  // (drawParticipantId, criterionId). НЕ реализуем "поменять местами" —
  // сервер (final-scoring.ts) проверяет отсутствие дубликата места СИНХРОННО
  // на каждую отправку, поэтому одновременный обмен двух уже занятых мест
  // неизбежно споткнётся о переходное состояние, где оба участника случайно
  // делят одно значение. Если место занято другим — переключаем лист на
  // ЭТОГО другого участника, чтобы судья сначала освободил место у него.
  function assignPlace(item: FinalQueueItem, place: number) {
    if (!placementCriterion || confirmed) return;
    enqueueFinalJudgeScore(item.drawParticipantId, placementCriterion.id, place);
  }
  const rolesPresent = (["LEADER", "FOLLOWER"] as const).filter((r) => items.some((it) => it.role === r));
  const placedCount = placementCriterion ? items.filter((it) => placeOf(it) !== null).length : 0;
  const sheetItem = placeSheetFor ? (items.find((it) => it.drawParticipantId === placeSheetFor) ?? null) : null;

  return (
    <div className="flex flex-col gap-3">
      {!placementCriterion && (
        <div className="flex flex-col gap-1 rounded-app bg-night-card p-4">
          <p className="m-0 text-xs font-semibold uppercase tracking-wide text-night-muted">
            Пара {index + 1} из {items.length} · оценено {scoredCount}
          </p>
          <p className="m-0 text-lg font-bold text-night-text">
            №{current.bibNumber ?? "—"} {current.displayName} · {current.role === "LEADER" ? "Ведущий" : "Ведомая"}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-app border border-night-border bg-night-card p-3">
        <p className={`m-0 text-sm font-semibold ${scoredCount < items.length ? "text-night-muted" : "text-night-success"}`}>
          Оценено {scoredCount} из {items.length}
        </p>
        {confirmed ? (
          <span className="rounded-full border border-night-success/40 bg-night-success/10 px-3 py-1 text-sm font-semibold text-night-success">
            ✓ Готово — оценки зафиксированы
          </span>
        ) : (
          <ConfirmJudgingButton roundId={roundId} final />
        )}
      </div>

      {placementCriterion ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 rounded-app bg-night-card p-3">
            <span className="shrink-0 text-xs font-semibold text-night-muted">
              {placedCount} / {items.length}
            </span>
            <div className="flex flex-1 gap-1">
              {items.map((it) => (
                <span
                  key={it.drawParticipantId}
                  className={`h-1.5 flex-1 rounded-full ${placeOf(it) !== null ? "bg-night-primary" : "bg-night-card2"}`}
                />
              ))}
            </div>
          </div>

          {rolesPresent.map((role) => (
            <div key={role} className="flex flex-col gap-1 rounded-app bg-night-card p-2">
              {rolesPresent.length > 1 && (
                <p className="m-0 px-2 pt-1 text-xs font-semibold uppercase tracking-wide text-night-muted">
                  {role === "LEADER" ? "Ведущие" : "Ведомые"}
                </p>
              )}
              {roleGroup(role).map((it) => {
                const place = placeOf(it);
                return (
                  <button
                    key={it.drawParticipantId}
                    type="button"
                    disabled={confirmed}
                    onClick={() => setPlaceSheetFor(it.drawParticipantId)}
                    className="grid grid-cols-[40px_1fr_52px] items-center gap-2 rounded-app-sm border-b border-night-border/60 px-2 py-3 text-left last:border-b-0 disabled:opacity-60"
                  >
                    <span className="font-night text-sm font-bold text-night-muted">{it.bibNumber ?? "—"}</span>
                    <span className="min-w-0 truncate text-[0.95rem] text-night-text">{it.displayName}</span>
                    <span
                      className="flex h-9 w-full items-center justify-center rounded-app-sm border border-night-border text-base font-extrabold text-night-muted"
                      style={place !== null ? { background: placeColor(place), color: placeTextColor(place), borderColor: "transparent" } : undefined}
                    >
                      {place ?? "—"}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      ) : (
        <>
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
                      disabled={!canDec || confirmed}
                      onClick={() => enqueueFinalJudgeScore(current.drawParticipantId, c.id, Math.max(c.minScore, (value ?? c.minScore) - c.step))}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-app-sm border border-night-border bg-night-card2 text-xl text-night-text disabled:opacity-30"
                    >
                      −
                    </button>
                    <span className="w-9 shrink-0 text-center text-xl font-bold text-night-text">{value ?? "–"}</span>
                    <button
                      type="button"
                      disabled={!canInc || confirmed}
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
                  <p className="m-0 text-xs uppercase tracking-wide text-night-muted">{lowerIsBetter ? "Место" : "Моя сумма"}</p>
                  <p className="m-0 text-2xl font-bold text-night-text">{currentSum}</p>
                </div>
                {!lowerIsBetter && (
                  <div className="text-right">
                    <p className="m-0 text-xs uppercase tracking-wide text-night-muted">Моё место</p>
                    <p className="m-0 text-2xl font-bold text-night-primary">#{currentRank}</p>
                  </div>
                )}
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
        </>
      )}

      {sheetItem && placementCriterion && (
        <>
          <div className="fixed inset-0 z-40 bg-black/60" onClick={() => setPlaceSheetFor(null)} />
          <div className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-[520px] rounded-t-app border-t border-night-border bg-night-card2 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-night-border" />
            <p className="m-0 text-xs font-semibold uppercase tracking-wide text-night-muted">№{sheetItem.bibNumber ?? "—"}</p>
            <h3 className="m-0 mb-3 font-night text-lg font-extrabold text-night-text">{sheetItem.displayName}</h3>
            <div className="grid max-h-[50vh] grid-cols-4 gap-2 overflow-y-auto">
              {Array.from(
                { length: placementCriterion.maxScore - placementCriterion.minScore + 1 },
                (_, i) => placementCriterion.minScore + i
              ).map((place) => {
                const holder = holderAtPlace(sheetItem.role, place, sheetItem.drawParticipantId);
                const mine = placeOf(sheetItem) === place;
                return (
                  <button
                    key={place}
                    type="button"
                    onClick={() => {
                      if (mine) {
                        setPlaceSheetFor(null);
                        return;
                      }
                      if (holder) {
                        setPlaceSheetFor(holder.drawParticipantId);
                        return;
                      }
                      assignPlace(sheetItem, place);
                      setPlaceSheetFor(null);
                    }}
                    className="flex min-h-[64px] flex-col items-center justify-center gap-0.5 rounded-app-sm border border-night-border px-1 py-2 text-center text-night-muted"
                    style={holder || mine ? { background: placeColor(place), color: placeTextColor(place), borderColor: "transparent" } : undefined}
                  >
                    <span className="font-night text-lg font-extrabold">{place}</span>
                    <span className="max-w-full truncate text-[10px] leading-tight opacity-90">
                      {mine ? "выбрано" : holder ? holder.displayName : "свободно"}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="m-0 mt-3 text-xs text-night-muted">Занятое место откроет карточку того участника — сначала переставьте его.</p>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPlaceSheetFor(null)}
              className="mt-3 w-full border-night-border bg-transparent text-night-text hover:bg-night-card"
            >
              Отмена
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
