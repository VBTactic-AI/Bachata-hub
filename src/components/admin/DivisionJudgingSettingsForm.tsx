"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label, Input, Select } from "@/components/ui/field";
import { JUDGING_MAX_SCORE_LABELS, FINAL_FORMAT_LABELS } from "@/lib/competition-labels";

export type FinalFormatValue = "NORMAL" | "JUDGES_DANCE" | "RANDOM_COUPLES" | "RELATIVE_PLACEMENT";
export type FinalCriterionRow = { id?: string; name: string; minScore: number; maxScore: number; step: number; catalogId?: string | null };
export type CatalogCriterion = { id: string; name: string; minScore: number; maxScore: number; step: number };

const FIELD_CLASS = "border-admin-border bg-admin-card2 text-sm text-night-text focus:border-admin-primary focus:ring-admin-primary/20";

// "Настройки судейства" (вкладка "Судьи") — единая точка для ВСЕГО, что
// касается методики оценки одной категории: как судятся раунды ДО финала
// (Division.judgingMaxScore), каким форматом идёт сам финал
// (FinalSettings.format) и по каким критериям финал оценивается
// (FinalCriterion[]). Раньше формат и критерии жили раздельно — компактный
// дубль формата здесь и полная форма критериев на вкладке "Категории"/потом
// "Монитор" (комментарий ниже устарел, но сама причина остаётся в силе: не
// дублировать forma/критерии в двух местах). По прямому запросу пользователя
// (2026-09-09) критерии перенесены сюда — теперь это единственное место.
//
// PATCH/PUT — те же самые эндпоинты, что уже использовались: ротация
// отправляется как есть, без изменений (heatCapacity сюда не входит —
// редактируется отдельно, панелью категории на вкладке "Категории"), формат —
// вместе с уже существующими tracksCount/partnerChangeEnabled/config (эти
// два поля дальше нигде в бизнес-логике не читаются — см. docs/00_DECISIONS.md
// — но само значение в БД не трогаем, просто больше не даём его менять из UI),
// критерии — отдельным сохранением, как и раньше.
export function DivisionJudgingSettingsForm({
  divisionId,
  judgingMaxScore: initialJudgingMaxScore,
  judgingMaxScoreDisabledReason,
  rotationMode,
  rotationIntervalSec,
  rotationShiftMin,
  rotationShiftMax,
  finalFormat: initialFinalFormat,
  finalFormatDisabledReason,
  finalTracksCount,
  finalPartnerChangeEnabled,
  finalConfig,
  finalCriteria: initialCriteria,
  finalCriteriaCatalog: catalog,
}: {
  divisionId: string;
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
  finalCriteria: (FinalCriterionRow & { priority: number })[];
  finalCriteriaCatalog: CatalogCriterion[];
}) {
  const router = useRouter();
  const [judgingMaxScore, setJudgingMaxScore] = useState(initialJudgingMaxScore);
  const [finalFormat, setFinalFormat] = useState<FinalFormatValue>(initialFinalFormat);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Критерии финала — своя часть формы, своё сохранение (как и раньше,
  // FinalSettingsPanel.tsx): смена формата не должна требовать пересохранить
  // критерии, и наоборот.
  const [criteria, setCriteria] = useState<FinalCriterionRow[]>(() =>
    [...initialCriteria].sort((a, b) => a.priority - b.priority).map(({ id, name, minScore, maxScore, step, catalogId }) => ({ id, name, minScore, maxScore, step, catalogId }))
  );
  const [catalogPick, setCatalogPick] = useState(catalog[0]?.id ?? "");
  // JUDGES_DANCE — какие критерии оценивает "танцующий" (физически
  // партнёрящий, противоположной роли) судья, остальные — судья со стороны.
  // Ключ — id критерия, доступно только для уже сохранённых критериев.
  const initialDancingIds = ((finalConfig as { dancingJudgeCriteriaIds?: string[] } | null)?.dancingJudgeCriteriaIds ?? []).filter(Boolean);
  const [dancingIds, setDancingIds] = useState<Set<string>>(() => new Set(initialDancingIds));
  const [criteriaLoading, setCriteriaLoading] = useState(false);
  const [criteriaError, setCriteriaError] = useState<string | null>(null);

  const canEditJudgingMaxScore = judgingMaxScoreDisabledReason === null;
  const canEditFinalFormat = finalFormatDisabledReason === null;
  // Критерии закрыты тем же условием, что и формат (то же право
  // final:configure, та же блокировка "финал уже начат") — это одна методика,
  // не две разные.
  const canEditCriteria = canEditFinalFormat;
  const dancingIdsChanged =
    dancingIds.size !== initialDancingIds.length || initialDancingIds.some((id) => !dancingIds.has(id));
  const hasChanges =
    (canEditJudgingMaxScore && judgingMaxScore !== initialJudgingMaxScore) ||
    (canEditFinalFormat && (finalFormat !== initialFinalFormat || dancingIdsChanged));

  async function onSave() {
    setLoading(true);
    setError(null);
    const requests: Promise<Response>[] = [];
    if (canEditJudgingMaxScore && judgingMaxScore !== initialJudgingMaxScore) {
      requests.push(
        fetch(`/api/divisions/${divisionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rotationMode, rotationIntervalSec, rotationShiftMin, rotationShiftMax, judgingMaxScore }),
        })
      );
    }
    if (canEditFinalFormat && (finalFormat !== initialFinalFormat || dancingIdsChanged)) {
      const config = { ...(finalConfig as Record<string, unknown> | null), dancingJudgeCriteriaIds: [...dancingIds] };
      requests.push(
        fetch(`/api/divisions/${divisionId}/final-settings`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ format: finalFormat, tracksCount: finalTracksCount, partnerChangeEnabled: finalPartnerChangeEnabled, config }),
        })
      );
    }

    const results = await Promise.all(requests);
    setLoading(false);
    for (const res of results) {
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Не удалось сохранить настройки судейства.");
        return;
      }
    }
    router.refresh();
  }

  function updateCriterion(i: number, patch: Partial<FinalCriterionRow>) {
    setCriteria((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }
  function addCriterion() {
    setCriteria((prev) => [...prev, { name: "", minScore: 0, maxScore: 10, step: 1, catalogId: null }]);
  }
  // Добавление из глобального справочника (Справочники → Оценочные
  // показатели) — копирует значения на момент выбора, дальнейшая правка
  // справочника не меняет уже добавленную строку (CLAUDE.md §50-51).
  function addFromCatalog() {
    const c = catalog.find((x) => x.id === catalogPick);
    if (!c) return;
    setCriteria((prev) => [...prev, { name: c.name, minScore: c.minScore, maxScore: c.maxScore, step: c.step, catalogId: c.id }]);
  }
  function removeCriterion(i: number) {
    setCriteria((prev) => prev.filter((_, idx) => idx !== i));
  }
  function move(i: number, dir: -1 | 1) {
    setCriteria((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  function toggleDancing(criterionId: string) {
    setDancingIds((prev) => {
      const next = new Set(prev);
      if (next.has(criterionId)) next.delete(criterionId);
      else next.add(criterionId);
      return next;
    });
  }

  async function onSaveCriteria() {
    setCriteriaLoading(true);
    setCriteriaError(null);
    const res = await fetch(`/api/divisions/${divisionId}/final-criteria`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        criteria: criteria.map((c, i) => ({ id: c.id, name: c.name, priority: i + 1, minScore: c.minScore, maxScore: c.maxScore, step: c.step, catalogId: c.catalogId ?? null })),
      }),
    });
    setCriteriaLoading(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setCriteriaError(data.error || "Не удалось сохранить критерии.");
      return;
    }
    // Сервер возвращает сохранённые критерии с реальными id — подставляем их
    // в локальный state сразу, не дожидаясь router.refresh(): initialCriteria
    // передаётся сюда только один раз при монтировании (useState-инициализатор
    // не перезапускается при обновлении пропсов), поэтому без этого чекбокс
    // "судья оценивает" у только что созданных критериев оставался disabled
    // до полной перезагрузки страницы (найдено вживую, 2026-09-09).
    const saved = (data.criteria ?? []) as (FinalCriterionRow & { priority: number })[];
    if (saved.length > 0) {
      setCriteria(
        [...saved].sort((a, b) => a.priority - b.priority).map(({ id, name, minScore, maxScore, step, catalogId }) => ({ id, name, minScore, maxScore, step, catalogId }))
      );
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <Label className="text-night-text">
          Метод оценки раундов до финала
          <Select
            value={judgingMaxScore}
            disabled={!canEditJudgingMaxScore}
            onChange={(e) => setJudgingMaxScore(Number(e.target.value))}
            className={`${FIELD_CLASS} disabled:opacity-50`}
          >
            {Object.entries(JUDGING_MAX_SCORE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          {judgingMaxScoreDisabledReason && <span className="text-xs font-normal text-admin-muted">{judgingMaxScoreDisabledReason}</span>}
        </Label>

        <Label className="text-night-text">
          Методика финала
          <Select
            value={finalFormat}
            disabled={!canEditFinalFormat}
            onChange={(e) => setFinalFormat(e.target.value as FinalFormatValue)}
            className={`${FIELD_CLASS} disabled:opacity-50`}
          >
            {Object.entries(FINAL_FORMAT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          {finalFormatDisabledReason && <span className="text-xs font-normal text-admin-muted">{finalFormatDisabledReason}</span>}
        </Label>

        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="admin" disabled={loading || !hasChanges} onClick={onSave}>
            Сохранить
          </Button>
          {error && <span className="text-sm text-red-400">{error}</span>}
        </div>
      </div>

      <div className="flex flex-col gap-2.5 border-t border-admin-border pt-4">
        <p className="m-0 text-sm font-semibold text-night-text">Критерии финала</p>

        {!canEditCriteria ? (
          <p className="m-0 text-xs text-admin-muted">{finalFormatDisabledReason}</p>
        ) : (
          <>
            {finalFormat === "JUDGES_DANCE" && (
              <p className="m-0 text-xs leading-relaxed text-admin-muted">
                Стадия 1: финалисты-Партнёры танцуют — судьи-Партнёрши физически партнёрят и оценивают отмеченные ниже
                критерии, судьи-Партнёры смотрят со стороны и оценивают остальные. Стадия 2 — наоборот.
              </p>
            )}
            {finalFormat === "RELATIVE_PLACEMENT" && (
              <p className="m-0 text-xs leading-relaxed text-admin-muted">
                Судьи ставят место напрямую (1..N, без повторов), итог считается системой «скейтинг» — не суммой баллов.
                Нужен ровно один критерий ниже, например «Место», диапазон от 1 до числа финалистов, шаг 1.
              </p>
            )}
            <p className="m-0 text-xs leading-relaxed text-admin-muted">
              Порядок в списке определяет приоритет: при равной сумме баллов сначала сравнивается критерий №1, затем №2
              и так далее — на саму сумму (веса/коэффициенты) это не влияет.
            </p>

            <div className="flex flex-col gap-2">
              {criteria.map((c, i) => (
                <div key={i} className="flex flex-col gap-1.5 rounded-app-sm border border-admin-border bg-admin-card2 p-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="w-5 shrink-0 text-right text-xs font-bold text-admin-disabled">#{i + 1}</span>
                    <Input
                      value={c.name}
                      onChange={(e) => updateCriterion(i, { name: e.target.value })}
                      placeholder="Название"
                      className={`${FIELD_CLASS} flex-1`}
                    />
                  </div>
                  {/* grid, не flex-row с ручными px-отступами: три числовых поля
                      делят ширину карточки поровну и никогда её не пробивают,
                      сколько бы места ни было (найдено вживую, 2026-09-09 —
                      старая flex-строка "от/до/шаг" вылезала за карточку в
                      узкой колонке "Настройки судейства", 360px). */}
                  <div className="grid grid-cols-3 gap-1.5 pl-[26px]">
                    <label className="flex flex-col gap-0.5">
                      <span className="text-[10px] text-admin-disabled">От</span>
                      <Input
                        type="number"
                        value={c.minScore}
                        onChange={(e) => updateCriterion(i, { minScore: Number(e.target.value) })}
                        className={`${FIELD_CLASS} w-full`}
                      />
                    </label>
                    <label className="flex flex-col gap-0.5">
                      <span className="text-[10px] text-admin-disabled">До</span>
                      <Input
                        type="number"
                        value={c.maxScore}
                        onChange={(e) => updateCriterion(i, { maxScore: Number(e.target.value) })}
                        className={`${FIELD_CLASS} w-full`}
                      />
                    </label>
                    <label className="flex flex-col gap-0.5">
                      <span className="text-[10px] text-admin-disabled">Шаг</span>
                      <Input
                        type="number"
                        min={1}
                        value={c.step}
                        onChange={(e) => updateCriterion(i, { step: Number(e.target.value) })}
                        className={`${FIELD_CLASS} w-full`}
                      />
                    </label>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 pl-[26px]">
                    <Button type="button" size="sm" variant="adminOutline" disabled={i === 0} onClick={() => move(i, -1)}>
                      ↑
                    </Button>
                    <Button type="button" size="sm" variant="adminOutline" disabled={i === criteria.length - 1} onClick={() => move(i, 1)}>
                      ↓
                    </Button>
                    <Button type="button" size="sm" variant="ghost" className="text-admin-muted hover:text-red-400" onClick={() => removeCriterion(i)}>
                      Убрать
                    </Button>
                  </div>
                  {finalFormat === "JUDGES_DANCE" && (
                    <label className={`flex items-center gap-1.5 pl-[26px] text-xs ${c.id ? "text-admin-muted" : "text-admin-disabled"}`}>
                      <input type="checkbox" disabled={!c.id} checked={c.id ? dancingIds.has(c.id) : false} onChange={() => c.id && toggleDancing(c.id)} />
                      Танцующий в финале судья оценивает этот критерий{!c.id && " (сначала сохраните критерии)"}
                    </label>
                  )}
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-2">
              <Button
                type="button"
                size="sm"
                variant="adminOutline"
                disabled={finalFormat === "RELATIVE_PLACEMENT" && criteria.length >= 1}
                onClick={addCriterion}
              >
                + Критерий вручную
              </Button>
              {catalog.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <Select
                    value={catalogPick}
                    onChange={(e) => setCatalogPick(e.target.value)}
                    className={`${FIELD_CLASS} flex-1`}
                    disabled={finalFormat === "RELATIVE_PLACEMENT" && criteria.length >= 1}
                  >
                    {catalog.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.minScore}–{c.maxScore})
                      </option>
                    ))}
                  </Select>
                  <Button
                    type="button"
                    size="sm"
                    variant="adminOutline"
                    disabled={!catalogPick || (finalFormat === "RELATIVE_PLACEMENT" && criteria.length >= 1)}
                    onClick={addFromCatalog}
                  >
                    + Из справочника
                  </Button>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="admin"
                  disabled={criteriaLoading || criteria.length === 0 || criteria.some((c) => !c.name.trim())}
                  onClick={onSaveCriteria}
                >
                  Сохранить критерии
                </Button>
                {criteriaError && <span className="text-sm text-red-400">{criteriaError}</span>}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
