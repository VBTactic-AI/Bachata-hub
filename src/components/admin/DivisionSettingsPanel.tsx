"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label, Input, Select } from "@/components/ui/field";
import { GearIcon } from "@/components/admin/icons";
import { ROTATION_MODE_LABELS } from "@/lib/competition-labels";

type RotationMode = "TRACK_AUTO_SHIFT" | "SEGMENT_MANUAL_SHIFT";

export type DivisionSettings = {
  rotationMode: RotationMode;
  rotationIntervalSec: number;
  rotationShiftMin: number;
  rotationShiftMax: number;
};

const FIELD_CLASS = "border-admin-border bg-admin-card2 text-night-text focus:border-admin-primary focus:ring-admin-primary/20";

// Ротация партнёров по умолчанию — живёт внутри "Живого танцпола" на
// вкладке "Монитор" (2026-09-09, по решению пользователя: кто именно должен
// этим управлять — организатор или будущая роль DJ — ещё не решено, поэтому
// доступ пока не расширяется — та же аудитория, что и раньше, canManage).
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
      <div className="flex flex-wrap items-center gap-2 text-xs text-admin-muted">
        <span>
          Ротация по умолчанию: <span className="text-night-text">{ROTATION_MODE_LABELS[current.rotationMode] ?? current.rotationMode}</span>
          {current.rotationMode === "SEGMENT_MANUAL_SHIFT" && ` (${current.rotationShiftMin}–${current.rotationShiftMax} партнёров)`}
          {current.rotationMode === "TRACK_AUTO_SHIFT" && ` (каждые ${current.rotationIntervalSec} сек)`}
        </span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="inline-flex items-center gap-1 text-admin-primaryHover hover:text-night-text"
        >
          <GearIcon /> настроить
        </button>
      </div>
    );
  }

  return (
    <div className="mt-1 flex flex-col gap-2.5 rounded-app-sm border border-admin-border bg-admin-card2 p-3">
      <Label className="text-night-text">
        Ротация партнёров по умолчанию
        <Select value={rotationMode} onChange={(e) => setRotationMode(e.target.value as RotationMode)} className={FIELD_CLASS}>
          <option value="TRACK_AUTO_SHIFT">{ROTATION_MODE_LABELS.TRACK_AUTO_SHIFT}</option>
          <option value="SEGMENT_MANUAL_SHIFT">{ROTATION_MODE_LABELS.SEGMENT_MANUAL_SHIFT}</option>
        </Select>
      </Label>
      {rotationMode === "TRACK_AUTO_SHIFT" ? (
        <Label className="max-w-[220px] text-night-text">
          Интервал смены внутри трека (сек)
          <Input type="number" min={1} value={rotationIntervalSec} onChange={(e) => setRotationIntervalSec(e.target.value)} className={FIELD_CLASS} />
        </Label>
      ) : (
        <div className="flex gap-3">
          <Label className="flex-1 text-night-text">
            Мин. число партнёров
            <Input type="number" min={1} value={rotationShiftMin} onChange={(e) => setRotationShiftMin(e.target.value)} className={FIELD_CLASS} />
          </Label>
          <Label className="flex-1 text-night-text">
            Макс. число партнёров
            <Input type="number" min={1} value={rotationShiftMax} onChange={(e) => setRotationShiftMax(e.target.value)} className={FIELD_CLASS} />
          </Label>
        </div>
      )}
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" variant="admin" disabled={loading} onClick={onSave}>
          Сохранить
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-admin-muted hover:text-admin-primaryHover"
          disabled={loading}
          onClick={() => {
            resetToCurrent();
            setEditing(false);
          }}
        >
          отмена
        </Button>
        {error && <span className="text-sm text-red-400">{error}</span>}
      </div>
    </div>
  );
}
