"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";

export type FinalFormatValue = "NORMAL" | "JUDGES_DANCE" | "RANDOM_COUPLES";
export type FinalCriterionRow = { id?: string; name: string; minScore: number; maxScore: number; step: number };

const FORMAT_LABELS: Record<FinalFormatValue, string> = {
  NORMAL: "Обычный J&J",
  JUDGES_DANCE: "Танец с судьями",
  RANDOM_COUPLES: "Случайные пары",
};

// Настройки финала дивизиона (Этап 9) — формат/критерии до старта финала
// (StartFinalPanel). Приоритет критерия НЕ вводится числом — это порядок
// строк в списке (кнопки ↑/↓), сохраняется как priority = позиция+1, чтобы
// последовательность 1..N была гарантирована всегда, без ручной сверки
// (промт пользователя, п.50 "priority уникальны"/"идут последовательно").
export function FinalSettingsPanel({
  divisionId,
  format: initialFormat,
  tracksCount: initialTracksCount,
  partnerChangeEnabled: initialPartnerChangeEnabled,
  config: initialConfig,
  criteria: initialCriteria,
  locked,
}: {
  divisionId: string;
  format: FinalFormatValue;
  tracksCount: number;
  partnerChangeEnabled: boolean;
  config: unknown;
  criteria: (FinalCriterionRow & { priority: number })[];
  locked: boolean;
}) {
  const router = useRouter();
  const [format, setFormat] = useState<FinalFormatValue>(initialFormat);
  const [tracksCount, setTracksCount] = useState(initialTracksCount);
  const [partnerChangeEnabled, setPartnerChangeEnabled] = useState(initialPartnerChangeEnabled);
  const [criteria, setCriteria] = useState<FinalCriterionRow[]>(() =>
    [...initialCriteria].sort((a, b) => a.priority - b.priority).map(({ id, name, minScore, maxScore, step }) => ({ id, name, minScore, maxScore, step }))
  );
  // JUDGES_DANCE — какие критерии оценивает "танцующий" (физически
  // партнёрящий, противоположной роли) судья, остальные — судья со стороны
  // (промт пользователя, п.22-23 "scoring matrix"). Ключ — id критерия,
  // значит доступно только для уже сохранённых критериев (см. чекбокс ниже).
  const [dancingIds, setDancingIds] = useState<Set<string>>(
    () => new Set(((initialConfig as { dancingJudgeCriteriaIds?: string[] } | null)?.dancingJudgeCriteriaIds ?? []).filter(Boolean))
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (locked) {
    return (
      <div className="stack gap-1 mt-2">
        <p className="hint-text font-semibold m-0">Финал</p>
        <p className="hint-text m-0">
          Финал уже начат — формат «{FORMAT_LABELS[initialFormat]}», критериев: {initialCriteria.length}. Настройки заблокированы.
        </p>
      </div>
    );
  }

  function updateCriterion(i: number, patch: Partial<FinalCriterionRow>) {
    setCriteria((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }
  function addCriterion() {
    setCriteria((prev) => [...prev, { name: "", minScore: 0, maxScore: 10, step: 1 }]);
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

  async function onSaveSettings() {
    setLoading(true);
    setError(null);
    const config = format === "JUDGES_DANCE" ? { dancingJudgeCriteriaIds: [...dancingIds] } : {};
    const res = await fetch(`/api/divisions/${divisionId}/final-settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format, tracksCount, partnerChangeEnabled, config }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось сохранить настройки.");
      return;
    }
    router.refresh();
  }

  async function onSaveCriteria() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/divisions/${divisionId}/final-criteria`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        criteria: criteria.map((c, i) => ({ id: c.id, name: c.name, priority: i + 1, minScore: c.minScore, maxScore: c.maxScore, step: c.step })),
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось сохранить критерии.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="stack gap-2 mt-2">
      <p className="hint-text font-semibold m-0">Финал</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="stack gap-1">
          <span className="hint-text">Формат</span>
          <Select value={format} onChange={(e) => setFormat(e.target.value as FinalFormatValue)} className="max-w-[300px]">
            {(Object.keys(FORMAT_LABELS) as FinalFormatValue[]).map((f) => (
              <option key={f} value={f}>
                {FORMAT_LABELS[f]}
              </option>
            ))}
          </Select>
        </label>
        <label className="stack gap-1">
          <span className="hint-text">Треков</span>
          <Input type="number" min={1} value={tracksCount} onChange={(e) => setTracksCount(Number(e.target.value))} className="max-w-[100px]" />
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={partnerChangeEnabled} onChange={(e) => setPartnerChangeEnabled(e.target.checked)} />
          Смена партнёров
        </label>
        <Button type="button" size="sm" variant="outline" disabled={loading} onClick={onSaveSettings}>
          Сохранить настройки
        </Button>
      </div>

      {format === "JUDGES_DANCE" && (
        <p className="hint-text m-0">
          Стадия 1: ведущие финалисты танцуют — судьи-Ведомые физически партнёрят и оценивают отмеченные ниже критерии,
          судьи-Ведущие смотрят со стороны и оценивают остальные. Стадия 2 — наоборот.
        </p>
      )}

      <div>
        <p className="hint-text m-0">
          Критерии оценки — порядок в списке определяет приоритет: если у двух участников совпала общая сумма баллов, сначала
          сравнивается критерий №1, затем №2 и так далее. Это НЕ влияет на саму сумму баллов (веса/коэффициенты не используются).
        </p>
        <div className="stack gap-1 mt-1">
          {criteria.map((c, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <span className="hint-text w-6 text-right">#{i + 1}</span>
              <Input value={c.name} onChange={(e) => updateCriterion(i, { name: e.target.value })} placeholder="Название" className="max-w-[180px]" />
              <span className="hint-text">от</span>
              <Input
                type="number"
                value={c.minScore}
                onChange={(e) => updateCriterion(i, { minScore: Number(e.target.value) })}
                className="max-w-[70px]"
              />
              <span className="hint-text">до</span>
              <Input
                type="number"
                value={c.maxScore}
                onChange={(e) => updateCriterion(i, { maxScore: Number(e.target.value) })}
                className="max-w-[70px]"
              />
              <span className="hint-text">шаг</span>
              <Input type="number" min={1} value={c.step} onChange={(e) => updateCriterion(i, { step: Number(e.target.value) })} className="max-w-[70px]" />
              <Button type="button" size="sm" variant="outline" disabled={i === 0} onClick={() => move(i, -1)}>
                ↑
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={i === criteria.length - 1} onClick={() => move(i, 1)}>
                ↓
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => removeCriterion(i)}>
                Убрать
              </Button>
              {format === "JUDGES_DANCE" && (
                <label className={`flex items-center gap-1.5 text-sm ${c.id ? "" : "text-muted"}`}>
                  <input type="checkbox" disabled={!c.id} checked={c.id ? dancingIds.has(c.id) : false} onChange={() => c.id && toggleDancing(c.id)} />
                  Танцующий судья{!c.id && " (сначала сохраните критерии)"}
                </label>
              )}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <Button type="button" size="sm" variant="outline" onClick={addCriterion}>
            + Критерий
          </Button>
          <Button type="button" size="sm" disabled={loading || criteria.length === 0 || criteria.some((c) => !c.name.trim())} onClick={onSaveCriteria}>
            Сохранить критерии
          </Button>
        </div>
      </div>
      {error && <span className="error-text">{error}</span>}
    </div>
  );
}
