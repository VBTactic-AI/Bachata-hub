"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/field";
import { PencilIcon } from "@/components/admin/icons";
import { DeleteIconButton } from "@/components/admin/DeleteIconButton";

export type CategoryOption = { id: string; name: string };
export type StageOption = { id: string; name: string; defaultAdvanceCount: number };
type RotationMode = "TRACK_AUTO_SHIFT" | "SEGMENT_MANUAL_SHIFT";

export type DivisionOverviewRow = {
  id: string;
  categoryName: string;
  heatCapacity: number;
  // Ротация не редактируется здесь (пользователь ещё не решил, где ей быть
  // окончательно, 2026-09-09) — передаётся только как есть, чтобы PATCH
  // /api/divisions/[id] (общий эндпоинт для всех настроек дивизиона) не
  // затёр её при сохранении вместимости/плана по этапам.
  rotationMode: RotationMode;
  rotationIntervalSec: number;
  rotationShiftMin: number;
  rotationShiftMax: number;
  judgingMaxScoreLabel: string;
  finalFormatLabel: string;
  stagePlan: { stageId: string; participantCount: number }[];
  // Раунды уже сгенерированы — план по этапам и вместимость паркета
  // "зафиксированы" в них, редактирование заблокировано целиком (по прямому
  // решению пользователя, 2026-09-09: кнопка редактирования становится
  // неактивной, а не просто урезанной).
  locked: boolean;
};

// Цвет-точка категории — чисто визуальный ориентир (по референсу
// пользователя, 2026-09-09), не токен темы и не поле в БД (у DivisionCategory
// нет цвета) — тот же приём, что и в JudgesWorkspace.tsx/PLACE_COLORS
// (FinalJudgingScreen.tsx, CLAUDE.md §64.4): назначается по порядку строк.
const DOT_COLORS = ["#3b82f6", "#22c55e", "#a78bfa", "#fb923c", "#f87171", "#facc15", "#22d3ee", "#f472b6"];

const FIELD_CLASS = "border-admin-border bg-admin-card2 text-sm text-night-text focus:border-admin-primary focus:ring-admin-primary/20";

type PanelState = { mode: "add" } | { mode: "edit"; division: DivisionOverviewRow } | null;

// "Категории соревнования" (redesign 2026-09-09, по референсу пользователя)
// — сводная таблица + панель добавления/редактирования. Раунды, жеребьёвка,
// настройки финала и ротация партнёров, которые раньше жили здесь же,
// переехали на вкладку "Раунды" (временно — пользователь ещё не решил
// окончательное расположение). Метод оценки раундов до финала настраивается
// на вкладке "Судьи" — здесь только отображается столбцом.
export function DivisionsOverviewTable({
  competitionId,
  divisions,
  availableCategories,
  stages,
}: {
  competitionId: string;
  divisions: DivisionOverviewRow[];
  availableCategories: CategoryOption[];
  stages: StageOption[];
}) {
  const router = useRouter();
  const [panel, setPanel] = useState<PanelState>(null);

  function close() {
    setPanel(null);
  }
  function onDone() {
    setPanel(null);
    router.refresh();
  }

  return (
    // Панель добавления/редактирования — компактным блоком СПРАВА от таблицы
    // (по референсу пользователя, 2026-09-09), не растянута сверху во всю
    // ширину. Грид вместо flex-row, чтобы на мобильном (grid-cols-1) панель
    // естественно уходила под таблицу, а не сжимала её. Ширина панели — 380px
    // (не 320px, как было раньше: не помещались поля/кнопки, найдено
    // пользователем вживую).
    <div className={`grid grid-cols-1 gap-4 ${panel !== null ? "lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start" : ""}`}>
      <Card className="flex min-w-0 flex-col gap-3 border-admin-border bg-admin-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="m-0 mb-1 font-semibold text-night-text">Категории соревнования</p>
            <p className="m-0 text-sm text-admin-muted">Настройте категории, которые будут участвовать в этом соревновании.</p>
          </div>
          {panel === null && (
            <Button type="button" size="sm" variant="admin" onClick={() => setPanel({ mode: "add" })}>
              + Добавить категорию
            </Button>
          )}
        </div>

        {divisions.length === 0 ? (
          <p className="m-0 text-sm text-admin-muted">Категорий пока нет.</p>
        ) : (
          <div className="overflow-x-auto rounded-app border border-admin-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-admin-card2 text-xs font-semibold uppercase tracking-wide text-admin-disabled">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">№</th>
                  <th className="px-3 py-2.5 font-semibold">Категория</th>
                  <th className="px-3 py-2.5 font-semibold">Мест на паркете</th>
                  <th className="px-3 py-2.5 font-semibold">Метод судейства</th>
                  <th className="px-3 py-2.5 font-semibold">Финал</th>
                  <th className="px-3 py-2.5 font-semibold">Этапы</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Действия</th>
                </tr>
              </thead>
              <tbody>
                {divisions.map((d, i) => (
                  <tr key={d.id} className="border-t border-admin-border">
                    <td className="px-3 py-3 align-middle text-admin-muted">{i + 1}</td>
                    <td className="px-3 py-3 align-middle font-medium text-night-text">
                      <span className="flex items-center gap-2 whitespace-nowrap">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: DOT_COLORS[i % DOT_COLORS.length] }} aria-hidden="true" />
                        {d.categoryName}
                      </span>
                    </td>
                    <td className="px-3 py-3 align-middle text-admin-muted">{d.heatCapacity}</td>
                    <td className="px-3 py-3 align-middle text-admin-muted">{d.judgingMaxScoreLabel}</td>
                    <td className="px-3 py-3 align-middle text-admin-muted">{d.finalFormatLabel}</td>
                    <td className="px-3 py-3 align-middle text-admin-muted">
                      {d.stagePlan.length > 0 ? d.stagePlan.map((p) => p.participantCount).join(" / ") : "—"}
                    </td>
                    <td className="px-3 py-3 align-middle">
                      <div className="flex items-center justify-end gap-3">
                        <button
                          type="button"
                          disabled={d.locked}
                          onClick={() => setPanel({ mode: "edit", division: d })}
                          title={d.locked ? "Для категории уже сгенерированы раунды — редактирование недоступно" : "Редактировать"}
                          aria-label={`Редактировать категорию ${d.categoryName}`}
                          className="text-admin-muted hover:text-night-text disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-admin-muted"
                        >
                          <PencilIcon />
                        </button>
                        <DeleteIconButton
                          url={`/api/divisions/${d.id}`}
                          confirmMessage={`Удалить категорию «${d.categoryName}»? Это необратимо.`}
                          label={`Удалить категорию ${d.categoryName}`}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {panel !== null && (
        <div className="rounded-app border border-admin-border bg-admin-card p-4 lg:sticky lg:top-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="m-0 text-sm font-semibold text-night-text">
              {panel.mode === "add" ? "Добавить категорию" : `Редактировать «${panel.division.categoryName}»`}
            </p>
            <button type="button" onClick={close} aria-label="Закрыть форму" className="text-admin-muted hover:text-night-text">
              ✕
            </button>
          </div>
          <DivisionForm competitionId={competitionId} panel={panel} availableCategories={availableCategories} stages={stages} onDone={onDone} onCancel={close} />
        </div>
      )}
    </div>
  );
}

function DivisionForm({
  competitionId,
  panel,
  availableCategories,
  stages,
  onDone,
  onCancel,
}: {
  competitionId: string;
  panel: { mode: "add" } | { mode: "edit"; division: DivisionOverviewRow };
  availableCategories: CategoryOption[];
  stages: StageOption[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const isEdit = panel.mode === "edit";
  const [categoryId, setCategoryId] = useState(availableCategories[0]?.id ?? "");
  const [heatCapacity, setHeatCapacity] = useState(isEdit ? String(panel.division.heatCapacity) : "10");
  const [stagePlan, setStagePlan] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      stages.map((s) => {
        if (isEdit) {
          const existing = panel.division.stagePlan.find((p) => p.stageId === s.id);
          return [s.id, existing ? String(existing.participantCount) : ""];
        }
        return [s.id, String(s.defaultAdvanceCount)];
      })
    )
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isEdit && availableCategories.length === 0) {
    return (
      <p className="m-0 text-sm text-admin-muted">
        Все активные категории справочника уже добавлены в это соревнование — добавьте новую в «Справочники → Категории».
      </p>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const stagePlanEntries = stages
      .filter((s) => stagePlan[s.id]?.trim())
      .map((s) => ({ stageId: s.id, participantCount: Number(stagePlan[s.id]) }));

    const res = isEdit
      ? await fetch(`/api/divisions/${panel.division.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            heatCapacity: Number(heatCapacity),
            rotationMode: panel.division.rotationMode,
            rotationIntervalSec: panel.division.rotationIntervalSec,
            rotationShiftMin: panel.division.rotationShiftMin,
            rotationShiftMax: panel.division.rotationShiftMax,
            stagePlan: stagePlanEntries,
          }),
        })
      : await fetch(`/api/competitions/${competitionId}/divisions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ categoryId, heatCapacity: Number(heatCapacity), stagePlan: stagePlanEntries, rules: {} }),
        });

    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось сохранить категорию.");
      return;
    }
    onDone();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      {isEdit ? (
        <Label className="text-night-text">
          Категория
          <p className="m-0 mt-1 text-sm text-admin-muted">{panel.division.categoryName} (не меняется)</p>
        </Label>
      ) : (
        <Label className="text-night-text">
          Выберите категорию
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={FIELD_CLASS}>
            {availableCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Label>
      )}
      <Label className="text-night-text">
        Мест на паркете
        <Input type="number" min={1} value={heatCapacity} onChange={(e) => setHeatCapacity(e.target.value)} className={FIELD_CLASS} />
      </Label>

      {stages.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="m-0 text-sm font-semibold text-night-text">Этапы и количество участников</p>
          <div className="flex flex-col gap-2">
            {stages.map((s) => (
              <Label key={s.id} className="flex-row items-center justify-between gap-2 text-night-text">
                <span className="text-sm">{s.name}</span>
                <Input
                  type="number"
                  min={1}
                  placeholder="—"
                  value={stagePlan[s.id] ?? ""}
                  onChange={(e) => setStagePlan((prev) => ({ ...prev, [s.id]: e.target.value }))}
                  className={`${FIELD_CLASS} max-w-[110px]`}
                />
              </Label>
            ))}
          </div>
        </div>
      )}

      {error && <p className="m-0 text-sm text-red-400">{error}</p>}

      <div className="flex items-center gap-2">
        <Button type="button" size="sm" variant="secondary" disabled={loading} onClick={onCancel} className="border-admin-border bg-transparent text-night-text hover:bg-admin-card2">
          Отмена
        </Button>
        <Button type="submit" size="sm" variant="admin" disabled={loading}>
          Сохранить
        </Button>
      </div>
    </form>
  );
}
