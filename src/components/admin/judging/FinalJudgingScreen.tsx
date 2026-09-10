"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmJudgingButton } from "@/components/admin/ConfirmJudgingButton";
import { ContextBar } from "@/components/admin/judging/ContextBar";
import { ProgressBar } from "@/components/admin/judging/ProgressBar";
import { REGISTRATION_ROLE_LABELS_PLURAL as ROLE_LABELS_PLURAL } from "@/lib/competition-labels";
import {
  enqueueFinalJudgeScore,
  getQueuedFinalScore,
  subscribeFinalJudgeScoreQueue,
} from "@/components/admin/judging/final-judge-score-queue";

export type FinalCriterionInfo = { id: string; name: string; priority: number; minScore: number; maxScore: number; step: number };

// Цвета мест для RELATIVE_PLACEMENT (скейтинг) — фиксированный семантический
// набор, НЕ токены темы (CLAUDE.md §64.4) — не меняются при перекраске
// экрана в admin-* (2026-09-10). Индекс 5 (жёлтый) — единственный, которому
// нужен тёмный текст вместо белого.
const PLACE_COLORS = ["#ff2d8a", "#37d67a", "#a78bfa", "#fb923c", "#22d3ee", "#facc15", "#ff9ac9", "#94a3b8"];
function placeColor(place: number): string {
  return PLACE_COLORS[(place - 1) % PLACE_COLORS.length];
}
function placeTextColor(place: number): string {
  return (place - 1) % PLACE_COLORS.length === 5 ? "#241c00" : "#ffffff";
}

const FORMAT_LABELS: Record<string, string> = {
  NORMAL: "Критерии",
  JUDGES_DANCE: "Судейский танец",
  RANDOM_COUPLES: "Случайные пары",
  RELATIVE_PLACEMENT: "Скейтинг",
};

// Медали для предварительных мест 1-3 в матрице критериев (2026-09-10, по
// запросу пользователя: "хотя бы первые 3 места выделялись") — золото/
// серебро/бронза, отдельно от PLACE_COLORS (та палитра — для мест
// скейтинга, до 8 позиций подряд, здесь смысл другой: только топ-3 против
// остальных). Текст — тёмный, эти фоны светлые (правило read_me про
// контраст на цветных плашках).
const MEDAL_COLORS: Record<number, string> = { 1: "#fbbf24", 2: "#cbd5e1", 3: "#d98c4a" };
const MEDAL_TEXT = "#20160a";

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

// Судейский экран финала (CLAUDE.md §40 — быстро, без админских функций).
// Два принципиально разных режима:
// - RELATIVE_PLACEMENT (скейтинг) — судья расставляет МЕСТА, список
//   участников с местом рядом с каждым, тап открывает лист выбора места.
// - Остальные форматы (NORMAL/JUDGES_DANCE/RANDOM_COUPLES) — судья ставит
//   БАЛЛЫ по нескольким критериям. Раньше это было последовательное
//   пролистывание "один участник за раз" (Предыдущий/Следующий); по прямому
//   запросу пользователя (2026-09-10) заменено на матрицу: номера участников
//   по строкам, критерии по столбцам, вся категория на одном экране без
//   горизонтальной прокрутки (компактные ячейки), тап по ячейке — лист
//   выбора оценки в диапазоне критерия. Предварительная сумма и место в
//   строке считаются ТЕМ ЖЕ алгоритмом, что и подсказка "Моё место" раньше
//   (сумма по критериям судьи, при равенстве — приоритет критериев) — это
//   локальная клиентская подсказка, не официальный результат
//   (RankingEngine/final-ranking.ts на сервере), поэтому конфликтов с
//   реальным подсчётом при равенстве баллов быть не может: подсказка явно
//   не претендует на официальность (тот же текст предупреждения, что и
//   раньше был на вкладке "Мой рейтинг").
//
// Отправка — через офлайн-очередь (final-judge-score-queue.ts, CLAUDE.md
// §17): клик сохраняет локально и пытается отправить сразу, без связи —
// досылается сама.
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
  const lowerIsBetter = format === "RELATIVE_PLACEMENT";
  const router = useRouter();
  // Открытая карточка выбора места (скейтинг) — id участника, для которого
  // сейчас показан лист с местами 1..N, либо null, если лист закрыт.
  const [placeSheetFor, setPlaceSheetFor] = useState<string | null>(null);
  // Открытая ячейка матрицы (не-скейтинг форматы) — участник + критерий, для
  // которых сейчас показан лист выбора оценки.
  const [scoreSheetFor, setScoreSheetFor] = useState<{ drawParticipantId: string; criterionId: string } | null>(null);
  // Участники, освобождённые атомарной подменой места (final-scoring.ts:
  // "клиент занял их место — сервер обнулил их запись") — судья должен
  // видеть "—" СРАЗУ, не дожидаясь router.refresh() (промт пользователя,
  // 2026-09-07: "в UI пусто отображается сразу"). Чисто оптимистичная
  // клиентская подсказка: сбрасывается целиком, как только придут свежие
  // серверные props — то есть подтверждённое состояние всегда побеждает
  // предположение.
  const [optimisticallyCleared, setOptimisticallyCleared] = useState<Set<string>>(new Set());
  useEffect(() => {
    setOptimisticallyCleared(new Set());
  }, [items]);
  // Аудит судейских экранов (жалоба пользователя, 2026-09-10): то же мигание
  // "нажал — отжалось — снова нажалось", что и в JudgeScoreButtons.tsx —
  // effectiveValue() падал на серверный item.scores сразу после того, как
  // запись уходила из очереди (доставлена), а router.refresh() ещё не успел
  // подвезти свежие props (дебаунс 400мс ниже). overrides держит то, что
  // судья реально выбрал (ключ "drawParticipantId:criterionId"), пока
  // серверные props сами не подтвердят то же значение — тогда запись из
  // overrides просто больше не нужна (оба источника совпадают, экран не
  // меняется — тот же принцип, что описал пользователь).
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  useEffect(() => {
    setOverrides((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      const byId = new Map(items.map((it) => [it.drawParticipantId, it]));
      let changed = false;
      const next = { ...prev };
      for (const key of Object.keys(prev)) {
        const sep = key.indexOf(":");
        const serverValue = byId.get(key.slice(0, sep))?.scores[key.slice(sep + 1)] ?? null;
        if (serverValue === prev[key]) {
          delete next[key];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [items]);
  // Реактивный тик — просто чтобы перерисоваться, когда очередь меняется
  // (эффективные значения читаются заново из очереди/пропсов при рендере).
  const [, setTick] = useState(0);
  // Как только очередь ДОСТАВИЛА оценку (ключ пропал из очереди без ошибки),
  // серверные props (items) устарели — без router.refresh() сумма/место
  // откатились бы к старому значению из первоначального рендера, как только
  // локальная очередь опустеет (баг, найденный вживую 2026-09-04).
  const pendingKeysRef = useRef<Set<string>>(new Set());
  // Дебаунс router.refresh(), а не вызов на каждую доставленную оценку —
  // при догоне очереди после офлайна несколько критериев/участников
  // доставляются подряд (тот же приём, что и в JudgeScoreButtons.tsx).
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
      const relevantErrors = Object.fromEntries(Object.entries(state.errors).filter(([k]) => relevantIds.has(k.split(":")[0])));
      setErrorsByKey(relevantErrors);
      // Сервер отклонил — откатываем override для этого ключа, иначе ячейка
      // навсегда показывала бы то, что судья пытался поставить (см.
      // аналогичный откат в JudgeScoreButtons.tsx).
      const erroredKeys = Object.keys(relevantErrors);
      if (erroredKeys.length > 0) {
        setOverrides((prev) => {
          let changed = false;
          const next = { ...prev };
          for (const k of erroredKeys) {
            if (k in next) {
              delete next[k];
              changed = true;
            }
          }
          return changed ? next : prev;
        });
      }
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
    const key = `${item.drawParticipantId}:${criterionId}`;
    if (key in overrides) return overrides[key];
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
  const pct = items.length > 0 ? (scoredCount / items.length) * 100 : 0;

  // Локальный рейтинг ЭТОГО судьи — сумма DESC, при равенстве сумма по
  // критерию приоритета #1, затем #2 и т.д. (тот же порядок сравнения, что
  // и в official ranking engine, только чисто на клиенте для подсказки судье
  // — "не является официальным рейтингом").
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

  function rankOf(item: FinalQueueItem): number {
    return ranked.findIndex((r) => r.drawParticipantId === item.drawParticipantId) + 1;
  }

  const rolesPresent = (["LEADER", "FOLLOWER"] as const).filter((r) => items.some((it) => it.role === r));
  const categoryLabel = rolesPresent.map((r) => ROLE_LABELS_PLURAL[r]).join(" / ") || "—";

  // RELATIVE_PLACEMENT — судья видит сразу весь список своей роли с местом
  // рядом с каждым. Формат гарантированно имеет ровно один критерий
  // (FinalSettingsPanel.tsx, валидация "требует ровно один критерий").
  const placementCriterion = format === "RELATIVE_PLACEMENT" ? sortedCriteria[0] : undefined;

  function placeOf(item: FinalQueueItem): number | null {
    if (optimisticallyCleared.has(item.drawParticipantId)) return null;
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
  // Переставить участника на место — идёт через ту же офлайн-очередь, что и
  // обычная оценка. Если место уже занято другим участником той же роли —
  // сервер (final-scoring.ts) сам атомарно освобождает прежнего обладателя в
  // одной транзакции с записью нового значения; клиенту достаточно один раз
  // сказать "хочу вот это место". holderId, если передан, — только для
  // мгновенной оптимистичной подсказки в UI.
  function assignPlace(item: FinalQueueItem, place: number, holderId?: string) {
    if (!placementCriterion || confirmed) return;
    setOptimisticallyCleared((prev) => {
      const next = new Set(prev);
      next.delete(item.drawParticipantId);
      if (holderId) next.add(holderId);
      return next;
    });
    setOverrides((prev) => ({ ...prev, [`${item.drawParticipantId}:${placementCriterion.id}`]: place }));
    enqueueFinalJudgeScore(item.drawParticipantId, placementCriterion.id, place);
  }
  const placedCount = placementCriterion ? items.filter((it) => placeOf(it) !== null).length : 0;
  const sheetItem = placeSheetFor ? (items.find((it) => it.drawParticipantId === placeSheetFor) ?? null) : null;

  const scoreSheetItem = scoreSheetFor ? (items.find((it) => it.drawParticipantId === scoreSheetFor.drawParticipantId) ?? null) : null;
  const scoreSheetCriterion = scoreSheetFor ? sortedCriteria.find((c) => c.id === scoreSheetFor.criterionId) : undefined;
  function setScore(item: FinalQueueItem, criterionId: string, value: number) {
    if (confirmed) return;
    setOverrides((prev) => ({ ...prev, [`${item.drawParticipantId}:${criterionId}`]: value }));
    enqueueFinalJudgeScore(item.drawParticipantId, criterionId, value);
    setScoreSheetFor(null);
  }

  if (items.length === 0) {
    return <p className="text-sm text-admin-muted">Пока нет вызванных участников вашей роли для оценки.</p>;
  }

  const footer = (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={`m-0 text-sm font-semibold ${scoredCount < items.length ? "text-admin-muted" : "text-night-success"}`}>
          Оценено {scoredCount} из {items.length}
        </p>
        {confirmed ? (
          <span className="rounded-full border border-night-success/40 bg-night-success/10 px-3 py-1 text-sm font-semibold text-night-success">
            ✓ Готово
          </span>
        ) : (
          <ConfirmJudgingButton roundId={roundId} final />
        )}
      </div>
      <ProgressBar pct={pct} />
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      <ContextBar categoryLabel={categoryLabel} stageLabel={FORMAT_LABELS[format]} />

      {placementCriterion ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 rounded-app border border-admin-border bg-admin-card p-3">
            <span className="shrink-0 text-xs font-semibold text-admin-muted">
              {placedCount} / {items.length}
            </span>
            <div className="flex flex-1 gap-1">
              {items.map((it) => (
                <span
                  key={it.drawParticipantId}
                  className={`h-1.5 flex-1 rounded-full ${placeOf(it) !== null ? "bg-admin-primary" : "bg-admin-card2"}`}
                />
              ))}
            </div>
          </div>

          {rolesPresent.map((role) => (
            <div key={role} className="flex flex-col gap-1 rounded-app border border-admin-border bg-admin-card p-2">
              {rolesPresent.length > 1 && (
                <p className="m-0 px-2 pt-1 text-xs font-semibold uppercase tracking-wide text-admin-muted">{ROLE_LABELS_PLURAL[role]}</p>
              )}
              {roleGroup(role).map((it) => {
                const place = placeOf(it);
                return (
                  <button
                    key={it.drawParticipantId}
                    type="button"
                    disabled={confirmed}
                    onClick={() => setPlaceSheetFor(it.drawParticipantId)}
                    className="grid grid-cols-[40px_1fr_52px] items-center gap-2 rounded-app-sm border-b border-admin-border/60 px-2 py-3 text-left last:border-b-0 disabled:opacity-60"
                  >
                    <span className="font-night text-sm font-bold text-admin-muted">{it.bibNumber ?? "—"}</span>
                    <span className="min-w-0 truncate text-[0.95rem] text-night-text">{it.displayName}</span>
                    <span
                      className="flex h-9 w-full items-center justify-center rounded-app-sm border border-admin-border text-base font-extrabold text-admin-muted"
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
        <FinalScoreMatrix
          items={items}
          sortedCriteria={sortedCriteria}
          effectiveValue={effectiveValue}
          effectiveSum={effectiveSum}
          rankOf={rankOf}
          rolesPresent={rolesPresent}
          roleGroup={roleGroup}
          confirmed={confirmed}
          errorsByKey={errorsByKey}
          onOpenCell={(drawParticipantId, criterionId) => setScoreSheetFor({ drawParticipantId, criterionId })}
        />
      )}

      <div className="sticky bottom-0 -mx-0 border-t border-admin-border bg-admin-bg px-0 pt-2">{footer}</div>

      {sheetItem && placementCriterion && (
        <>
          <div className="fixed inset-0 z-40 bg-black/60" onClick={() => setPlaceSheetFor(null)} />
          <div className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-[520px] rounded-t-app border-t border-admin-border bg-admin-card2 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-admin-border" />
            <p className="m-0 text-xs font-semibold uppercase tracking-wide text-admin-muted">№{sheetItem.bibNumber ?? "—"}</p>
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
                      assignPlace(sheetItem, place, holder?.drawParticipantId);
                      setPlaceSheetFor(null);
                    }}
                    className="flex min-h-[64px] flex-col items-center justify-center gap-0.5 rounded-app-sm border border-admin-border px-1 py-2 text-center text-admin-muted"
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
            <p className="m-0 mt-3 text-xs text-admin-muted">Если место занято — прежний обладатель освободится автоматически.</p>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPlaceSheetFor(null)}
              className="mt-3 w-full border-admin-border bg-transparent text-night-text hover:bg-admin-card"
            >
              Отмена
            </Button>
          </div>
        </>
      )}

      {scoreSheetItem && scoreSheetCriterion && (
        <>
          <div className="fixed inset-0 z-40 bg-black/60" onClick={() => setScoreSheetFor(null)} />
          <div className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-[520px] rounded-t-app border-t border-admin-border bg-admin-card2 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-admin-border" />
            <p className="m-0 text-xs font-semibold uppercase tracking-wide text-admin-muted">
              №{scoreSheetItem.bibNumber ?? "—"} · {scoreSheetCriterion.name}
            </p>
            <h3 className="m-0 mb-3 font-night text-lg font-extrabold text-night-text">
              Выбор оценки ({scoreSheetCriterion.minScore}–{scoreSheetCriterion.maxScore})
            </h3>
            <div className="grid max-h-[50vh] grid-cols-4 gap-2 overflow-y-auto">
              {Array.from(
                { length: Math.floor((scoreSheetCriterion.maxScore - scoreSheetCriterion.minScore) / scoreSheetCriterion.step) + 1 },
                (_, i) => scoreSheetCriterion.minScore + i * scoreSheetCriterion.step
              ).map((v) => {
                const active = effectiveValue(scoreSheetItem, scoreSheetCriterion.id) === v;
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setScore(scoreSheetItem, scoreSheetCriterion.id, v)}
                    className={`flex h-12 items-center justify-center rounded-app-sm border font-night text-base font-extrabold ${
                      active ? "border-admin-primary bg-admin-primary text-white" : "border-admin-border bg-admin-bg text-night-text"
                    }`}
                  >
                    {v}
                  </button>
                );
              })}
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setScoreSheetFor(null)}
              className="mt-3 w-full border-admin-border bg-transparent text-night-text hover:bg-admin-card"
            >
              Отмена
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

// Матрица "номера × критерии" на одном экране (2026-09-10, по прямому
// запросу пользователя — заменяет прежнее пролистывание "один участник за
// раз"). Компактные ячейки без горизонтальной прокрутки — судья видит сразу
// всех участников своей роли по всем критериям, тап по ячейке открывает
// лист выбора оценки (родительский компонент). Σ и Место — предварительная
// клиентская подсказка (не официальный результат, CLAUDE.md §16/§51 —
// официальный подсчёт остаётся на сервере, final-ranking.ts).
function FinalScoreMatrix({
  items,
  sortedCriteria,
  effectiveValue,
  effectiveSum,
  rankOf,
  rolesPresent,
  roleGroup,
  confirmed,
  errorsByKey,
  onOpenCell,
}: {
  items: FinalQueueItem[];
  sortedCriteria: FinalCriterionInfo[];
  effectiveValue: (item: FinalQueueItem, criterionId: string) => number | null;
  effectiveSum: (item: FinalQueueItem) => number;
  rankOf: (item: FinalQueueItem) => number;
  rolesPresent: readonly ("LEADER" | "FOLLOWER")[];
  roleGroup: (role: "LEADER" | "FOLLOWER") => FinalQueueItem[];
  confirmed: boolean;
  errorsByKey: Record<string, string>;
  onOpenCell: (drawParticipantId: string, criterionId: string) => void;
}) {
  const hasError = Object.keys(errorsByKey).length > 0;
  return (
    <div className="flex flex-col gap-3">
      {sortedCriteria.length > 1 && (
        <div className="flex flex-col gap-1.5 rounded-app-sm border border-admin-border bg-admin-card p-2">
          <p className="m-0 font-mono text-[9.5px] font-bold uppercase tracking-wide text-admin-muted">При равенстве баллов сравниваем:</p>
          <div className="flex flex-wrap gap-1.5">
            {sortedCriteria.map((c, i) => (
              <span key={c.id} className="flex items-center gap-1 rounded-full border border-admin-border bg-admin-card2 py-0.5 pl-0.5 pr-2">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-admin-primary font-mono text-[9px] font-extrabold text-white">
                  {i + 1}
                </span>
                <span className="text-[10.5px] font-bold text-night-text">{c.name}</span>
              </span>
            ))}
          </div>
        </div>
      )}
      {hasError && <p className="m-0 text-xs text-red-400">Не удалось сохранить одну или несколько оценок — откройте ячейку и поставьте заново.</p>}

      {rolesPresent.map((role) => (
        <div key={role} className="flex flex-col gap-1.5">
          {rolesPresent.length > 1 && (
            <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-admin-disabled">{ROLE_LABELS_PLURAL[role]}</p>
          )}
          <div className="overflow-x-auto rounded-app border border-admin-border">
            <table className="w-full table-fixed border-collapse">
              <thead>
                <tr>
                  <th className="bg-admin-card2 px-2 py-1.5 text-left font-mono text-[9px] font-bold uppercase text-admin-muted">№</th>
                  {sortedCriteria.map((c) => (
                    <th key={c.id} className="bg-admin-card2 px-0.5 py-1.5 text-center font-mono text-[9px] font-bold uppercase text-admin-muted">
                      {c.name.length > 4 ? c.name.slice(0, 3).toUpperCase() : c.name.toUpperCase()}
                    </th>
                  ))}
                  <th className="bg-admin-card2 px-1 py-1.5 text-center font-mono text-[9px] font-bold uppercase text-admin-muted">Σ</th>
                  <th className="bg-admin-card2 px-1 py-1.5 text-center font-mono text-[9px] font-bold uppercase text-admin-muted">Мес</th>
                </tr>
              </thead>
              <tbody>
                {roleGroup(role).map((item) => {
                  const rank = rankOf(item);
                  const complete = sortedCriteria.filter((c) => item.criteriaIds.includes(c.id)).every((c) => effectiveValue(item, c.id) !== null);
                  const medal = complete ? MEDAL_COLORS[rank] : undefined;
                  return (
                    <tr key={item.drawParticipantId} className="border-t border-admin-bg">
                      <td
                        className="bg-admin-card px-2 py-1 font-mono text-[13px] font-extrabold text-night-text"
                        style={medal ? { boxShadow: `inset 3px 0 0 ${medal}` } : undefined}
                      >
                        {item.bibNumber ?? "—"}
                      </td>
                      {sortedCriteria.map((c) => {
                        const applicable = item.criteriaIds.includes(c.id);
                        const value = applicable ? effectiveValue(item, c.id) : null;
                        const err = errorsByKey[`${item.drawParticipantId}:${c.id}`];
                        return (
                          <td key={c.id} className="bg-admin-card px-0.5 py-1 text-center">
                            {applicable ? (
                              <button
                                type="button"
                                disabled={confirmed}
                                onClick={() => onOpenCell(item.drawParticipantId, c.id)}
                                className={`mx-auto flex h-8 w-full max-w-[38px] items-center justify-center rounded-md border font-mono text-[12px] font-bold disabled:cursor-not-allowed disabled:opacity-50 ${
                                  err
                                    ? "border-red-400 text-red-400"
                                    : value !== null
                                      ? "border-admin-primary/50 bg-admin-primary/15 text-admin-primary"
                                      : "border-dashed border-admin-border text-admin-disabled"
                                }`}
                              >
                                {value ?? "–"}
                              </button>
                            ) : (
                              <span className="text-admin-disabled">—</span>
                            )}
                          </td>
                        );
                      })}
                      <td className={`bg-admin-card px-1 py-1 text-center font-mono text-[12px] font-extrabold ${complete ? "text-night-text" : "text-admin-disabled"}`}>
                        {effectiveSum(item)}
                        {!complete && "*"}
                      </td>
                      <td className="bg-admin-card px-1 py-1 text-center">
                        <span
                          className={`mx-auto flex h-6 w-6 items-center justify-center rounded-md font-mono text-[11px] font-extrabold ${
                            medal ? "" : complete ? "bg-admin-border text-admin-muted" : "bg-admin-border text-admin-disabled"
                          }`}
                          style={medal ? { background: medal, color: MEDAL_TEXT } : undefined}
                        >
                          {complete ? rank : "—"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      <p className="m-0 text-[11px] text-admin-muted">Σ и место — предварительная подсказка по вашим оценкам, не официальный результат. * — не все критерии оценены.</p>
    </div>
  );
}
