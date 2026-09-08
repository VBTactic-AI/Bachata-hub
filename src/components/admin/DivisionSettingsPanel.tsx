"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label, Input, Select } from "@/components/ui/field";
import { ROTATION_MODE_LABELS } from "@/lib/competition-labels";

type RotationMode = "TRACK_AUTO_SHIFT" | "SEGMENT_MANUAL_SHIFT";

export type DivisionSettings = {
  rotationMode: RotationMode;
  rotationIntervalSec: number;
  rotationShiftMin: number;
  rotationShiftMax: number;
};

// Ротация партнёров по умолчанию — временное расположение (вкладка "Раунды",
// 2026-09-09): вместимость паркета и метод оценки переехали в панель
// категории/"Настройки судейства" соответственно, здесь остаётся только
// ротация. Пользователь ещё не решил, где эта настройка будет жить
// окончательно — размещение может снова поменяться.
//
// Меняется НЕ голым полем на виду — только через явный "режим редактирования"
// (по запросу пользователя, 2026-09-04): форма для правки открывается
// кнопкой, чтобы не задеть значение, которое уже используется в расчётах,
// случайным кликом.
export function DivisionSettingsPanel({ divisionId, settings }: { divisionId: string; settings: DivisionSettings }) {
  const [current, setCurrent] = useState(settings);
  const [editing, setEditing] = useState(false);
  const [rotationMode, setRotationMode] = useState<RotationMode>(settings.rotationMode);
  const [rotationIntervalSec, setRotationIntervalSec] = useState(String(settings.rotationIntervalSec));
  const [rotationShiftMin, setRotationShiftMin] = useState(String(settings.rotationShiftMin));
  const [rotationShiftMax, setRotationShiftMax] = useState(String(settings.rotationShiftMax));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetToCurrent() {
    setRotationMode(current.rotationMode);
    setRotationIntervalSec(String(current.rotationIntervalSec));
    setRotationShiftMin(String(current.rotationShiftMin));
    setRotationShiftMax(String(current.rotationShiftMax));
    setError(null);
  }

  async function onSave() {
    setLoading(true);
    setError(null);
    const next: DivisionSettings = {
      rotationMode,
      rotationIntervalSec: Number(rotationIntervalSec),
      rotationShiftMin: Number(rotationShiftMin),
      rotationShiftMax: Number(rotationShiftMax),
    };
    const res = await fetch(`/api/divisions/${divisionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось сохранить настройки.");
      return;
    }
    setCurrent(next);
    setEditing(false);
  }

  if (!editing) {
    return (
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <p className="hint-text">
          Ротация: {ROTATION_MODE_LABELS[current.rotationMode] ?? current.rotationMode}
          {current.rotationMode === "SEGMENT_MANUAL_SHIFT" && ` (${current.rotationShiftMin}–${current.rotationShiftMax} партнёров)`}
          {current.rotationMode === "TRACK_AUTO_SHIFT" && ` (каждые ${current.rotationIntervalSec} сек)`}
        </p>
        <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(true)}>
          изменить настройки
        </Button>
      </div>
    );
  }

  return (
    <div className="stack gap-2 mt-2 rounded-app-sm border border-line p-3">
      <Label>
        Ротация партнёров по умолчанию
        <Select value={rotationMode} onChange={(e) => setRotationMode(e.target.value as RotationMode)}>
          <option value="TRACK_AUTO_SHIFT">{ROTATION_MODE_LABELS.TRACK_AUTO_SHIFT}</option>
          <option value="SEGMENT_MANUAL_SHIFT">{ROTATION_MODE_LABELS.SEGMENT_MANUAL_SHIFT}</option>
        </Select>
      </Label>
      {rotationMode === "TRACK_AUTO_SHIFT" ? (
        <Label className="max-w-[220px]">
          Интервал смены внутри трека (сек)
          <Input type="number" min={1} value={rotationIntervalSec} onChange={(e) => setRotationIntervalSec(e.target.value)} />
        </Label>
      ) : (
        <div className="flex gap-3">
          <Label className="flex-1">
            Мин. число партнёров
            <Input type="number" min={1} value={rotationShiftMin} onChange={(e) => setRotationShiftMin(e.target.value)} />
          </Label>
          <Label className="flex-1">
            Макс. число партнёров
            <Input type="number" min={1} value={rotationShiftMax} onChange={(e) => setRotationShiftMax(e.target.value)} />
          </Label>
        </div>
      )}
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" disabled={loading} onClick={onSave}>
          Сохранить
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={loading}
          onClick={() => {
            resetToCurrent();
            setEditing(false);
          }}
        >
          отмена
        </Button>
        {error && <span className="error-text">{error}</span>}
      </div>
    </div>
  );
}
