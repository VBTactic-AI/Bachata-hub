"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/field";
import { JUDGING_MAX_SCORE_LABELS, FINAL_FORMAT_LABELS } from "@/lib/competition-labels";
import { TrashIcon } from "@/components/admin/icons";
import { Switch } from "@/components/admin/Switch";

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
  judgingMaxScoreExistingRoundsWarning,
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
  judgingMaxScoreExistingRoundsWarning: string | null;
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
  const [catalogModalOpen, setCatalogModalOpen] = useState(false);
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
  const atCriteriaCap = finalFormat === "RELATIVE_PLACEMENT" && criteria.length >= 1;

  // Esc закрывает окно выбора — тот же приём, что и в DivisionJudgesPanel.tsx.
  useEffect(() => {
    if (!catalogModalOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setCatalogModalOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [catalogModalOpen]);

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
  // Добавление — только из глобального справочника (Справочники →
  // Оценочные показатели), по прямому запросу пользователя (2026-09-09):
  // копирует значения на момент выбора, дальнейшая правка справочника не
  // меняет уже добавленную строку (CLAUDE.md §50-51). Чекбокс живой — как в
  // DivisionJudgesPanel.tsx: отметка сразу пишет в criteria, снятие сразу
  // убирает, окно можно не закрывать между отметками (мультивыбор).
  function toggleCatalogItem(item: CatalogCriterion) {
    setCriteria((prev) => {
      if (prev.some((c) => c.catalogId === item.id)) return prev.filter((c) => c.catalogId !== item.id);
      return [...prev, { name: item.name, minScore: item.minScore, maxScore: item.maxScore, step: item.step, catalogId: item.id }];
    });
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
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setCriteriaLoading(false);
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
    // "Танцующий судья" — переключатель живёт прямо в этом списке критериев,
    // поэтому по прямому запросу пользователя (2026-09-10, "нажать сохранить
    // критерии — логичнее, т.к. ты редактируешь критерии") кнопка "Сохранить
    // критерии" теперь сохраняет и его: раньше это делала ТОЛЬКО отдельная
    // верхняя кнопка "Сохранить", и было неочевидно, какую именно нажимать
    // после переключения тумблера в списке критериев. Верхняя кнопка
    // по-прежнему тоже умеет это сохранить (не трогал) — просто теперь это не
    // единственный путь. Отправляем, только если формат JUDGES_DANCE
    // (переключатель вообще существует только в этом формате) и фильтруем
    // dancingIds по РЕАЛЬНО сохранённым id (saved) — если какой-то критерий в
    // этом же сохранении пересоздался с новым id (добавлен через справочник
    // заново), его старая пометка "танцующий" не переживает пересоздание (то
    // же самое уже верно и для верхней кнопки, ничего не меняет) — но сама
    // ссылка на уже удалённый id гарантированно не уйдёт на сервер.
    if (finalFormat === "JUDGES_DANCE") {
      const validIds = new Set(saved.length > 0 ? saved.map((c) => c.id).filter((id): id is string => !!id) : criteria.map((c) => c.id).filter((id): id is string => !!id));
      const cleanedDancingIds = [...dancingIds].filter((id) => validIds.has(id));
      const config = { ...(finalConfig as Record<string, unknown> | null), dancingJudgeCriteriaIds: cleanedDancingIds };
      const settingsRes = await fetch(`/api/divisions/${divisionId}/final-settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format: finalFormat, tracksCount: finalTracksCount, partnerChangeEnabled: finalPartnerChangeEnabled, config }),
      });
      if (!settingsRes.ok) {
        const settingsData = await settingsRes.json().catch(() => ({}));
        setCriteriaLoading(false);
        setCriteriaError(settingsData.error || "Критерии сохранены, но не удалось сохранить «Танцующий судья».");
        return;
      }
    }
    setCriteriaLoading(false);
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
          {!judgingMaxScoreDisabledReason && judgingMaxScoreExistingRoundsWarning && (
            <span className="text-xs font-normal text-night-warning">{judgingMaxScoreExistingRoundsWarning}</span>
          )}
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
        <div className="flex items-center justify-between">
          <p className="m-0 text-sm font-semibold text-night-text">Критерии финала</p>
          <span className="rounded-full border border-admin-border bg-admin-card2 px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-admin-muted">
            {criteria.length}
          </span>
        </div>

        {!canEditCriteria ? (
          <p className="m-0 text-xs text-admin-muted">{finalFormatDisabledReason}</p>
        ) : (
          <>
            <p className="m-0 rounded-app-sm border border-admin-border bg-admin-card2 px-3 py-2.5 text-xs leading-relaxed text-admin-muted">
              {finalFormat === "JUDGES_DANCE" && (
                <>
                  Стадия 1: финалисты-Партнёры танцуют — судьи-Партнёрши физически партнёрят и оценивают критерии с
                  пометкой «Танцующий», судьи-Партнёры смотрят со стороны и оценивают остальные. Стадия 2 — наоборот.{" "}
                </>
              )}
              {finalFormat === "RELATIVE_PLACEMENT" ? (
                <>
                  Судьи ставят место напрямую (1..N, без повторов), итог считается системой «скейтинг» — не суммой
                  баллов. Нужен ровно один критерий, например «Место», диапазон «до» подгоните под число финалистов.
                </>
              ) : (
                <>
                  Порядок строк — приоритет сравнения при равной сумме баллов: сначала критерий №1, затем №2 и так
                  далее — на саму сумму (веса/коэффициенты) это не влияет.
                </>
              )}
            </p>

            <div className="flex flex-col gap-1.5">
              {criteria.length === 0 && (
                <p className="m-0 rounded-app-sm border border-dashed border-admin-border px-3 py-4 text-center text-sm text-admin-disabled">
                  Критерии ещё не заведены
                </p>
              )}
              {criteria.map((c, i) => (
                <div key={c.id ?? `new-${i}`} className="flex flex-col gap-2 rounded-app-sm bg-admin-card2 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-app-sm bg-admin-card text-[11px] font-semibold tabular-nums text-admin-muted">
                      {i + 1}
                    </span>
                    <input
                      value={c.name}
                      onChange={(e) => updateCriterion(i, { name: e.target.value })}
                      placeholder="Название"
                      className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-[13.5px] font-semibold text-night-text transition hover:border-admin-border focus:border-admin-primary focus:bg-admin-card focus:outline-none"
                    />
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        title="Выше по приоритету"
                        disabled={i === 0}
                        onClick={() => move(i, -1)}
                        className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-admin-border text-[9px] text-admin-muted transition hover:border-admin-primary hover:text-admin-primaryHover disabled:opacity-30 disabled:hover:border-admin-border disabled:hover:text-admin-muted"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        title="Ниже по приоритету"
                        disabled={i === criteria.length - 1}
                        onClick={() => move(i, 1)}
                        className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-admin-border text-[9px] text-admin-muted transition hover:border-admin-primary hover:text-admin-primaryHover disabled:opacity-30 disabled:hover:border-admin-border disabled:hover:text-admin-muted"
                      >
                        ▼
                      </button>
                    </div>
                    <button
                      type="button"
                      title="Убрать"
                      aria-label={`Убрать критерий ${c.name || `#${i + 1}`}`}
                      onClick={() => removeCriterion(i)}
                      className="shrink-0 text-admin-muted transition hover:text-red-400"
                    >
                      <TrashIcon />
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 pl-8">
                    <RangeField label="От" value={c.minScore} onChange={(v) => updateCriterion(i, { minScore: v })} />
                    <RangeField label="До" value={c.maxScore} onChange={(v) => updateCriterion(i, { maxScore: v })} />
                    <RangeField label="Шаг" min={1} value={c.step} onChange={(v) => updateCriterion(i, { step: v })} />

                    {finalFormat === "JUDGES_DANCE" && (
                      <div className="ml-auto flex items-center gap-2">
                        <span className={`text-[11px] font-medium ${c.id && dancingIds.has(c.id) ? "text-admin-primaryHover" : "text-admin-muted"}`}>
                          {!c.id ? "Сначала сохраните" : dancingIds.has(c.id) ? "Танцующий судья" : "Судья со стороны"}
                        </span>
                        <Switch
                          checked={!!(c.id && dancingIds.has(c.id))}
                          disabled={!c.id}
                          onChange={() => c.id && toggleDancing(c.id)}
                          label={`Оценивает танцующий судья: ${c.name || `критерий ${i + 1}`}`}
                        />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              disabled={atCriteriaCap}
              onClick={() => setCatalogModalOpen(true)}
              className="w-full rounded-app-sm border border-dashed border-admin-border px-3 py-2 text-sm text-night-text transition-colors hover:border-admin-primary hover:text-admin-primary disabled:cursor-default disabled:opacity-40 disabled:hover:border-admin-border disabled:hover:text-night-text"
            >
              {atCriteriaCap ? "Скейтингу нужен только один критерий" : "+ Добавить из справочника"}
            </button>

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
          </>
        )}
      </div>

      {/* Добавление из справочника — тот же модальный паттерн, что и
          "Добавить судью" (DivisionJudgesPanel.tsx): чекбоксы живые, окно не
          закрывается между отметками, можно отметить сразу несколько
          (мультивыбор, по прямому запросу пользователя, 2026-09-09). Ручной
          ввод убран — критерии заводятся только через глобальный справочник
          (Справочники → Оценочные показатели), диапазон/шаг после добавления
          остаются редактируемыми (нужно для "Места" в скейтинге). */}
      {catalogModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5" onClick={() => setCatalogModalOpen(false)} role="presentation">
          <div
            className="flex max-h-[80vh] w-full max-w-[420px] flex-col overflow-hidden rounded-app border border-admin-border bg-admin-card shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-criterion-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-admin-border px-5 py-4">
              <h3 id="add-criterion-title" className="m-0 text-[17px] font-extrabold text-night-text">
                Добавить из справочника
              </h3>
              <p className="m-0 mt-1.5 text-[12.5px] text-admin-muted">
                Отметьте один или несколько показателей — появятся в списке сразу, сохранятся вместе с остальными
                изменениями по «Сохранить критерии».
              </p>
            </div>

            <div className="flex-1 overflow-y-auto py-1.5">
              {catalog.length === 0 ? (
                <p className="m-0 px-5 py-4 text-sm text-admin-muted">
                  В справочнике нет активных показателей. Добавьте их в «Справочники → Оценочные показатели».
                </p>
              ) : (
                catalog.map((item) => {
                  const checked = criteria.some((c) => c.catalogId === item.id);
                  const disabled = atCriteriaCap && !checked;
                  return (
                    <label
                      key={item.id}
                      className={`flex items-center gap-3 px-5 py-2 ${disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer hover:bg-admin-card2"}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        onChange={() => toggleCatalogItem(item)}
                        className="h-[18px] w-[18px] shrink-0 accent-admin-primary"
                      />
                      <span className="flex min-w-0 flex-col gap-0.5 truncate">
                        <span className="truncate text-sm font-semibold text-night-text">{item.name}</span>
                        <span className="text-[10.5px] tabular-nums text-admin-muted">
                          {item.minScore}–{item.maxScore} · шаг {item.step}
                        </span>
                      </span>
                    </label>
                  );
                })
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-admin-border px-5 py-4">
              <Button type="button" size="sm" variant="admin" onClick={() => setCatalogModalOpen(false)}>
                Готово
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Компактное числовое поле "От/До/Шаг" внутри строки критерия — общий
// маленький хелпер вместо повторения одной и той же разметки трижды.
function RangeField({ label, value, onChange, min }: { label: string; value: number; onChange: (v: number) => void; min?: number }) {
  return (
    <label className="flex items-center gap-1 rounded-app-sm bg-admin-card px-1.5 py-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-admin-disabled">{label}</span>
      <input
        type="number"
        min={min}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-[34px] rounded-md border border-transparent bg-transparent px-1 py-0.5 text-right text-[12.5px] tabular-nums text-night-text transition hover:border-admin-border focus:border-admin-primary focus:bg-admin-card2 focus:outline-none"
      />
    </label>
  );
}
