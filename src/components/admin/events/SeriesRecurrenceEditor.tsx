"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/admin/Switch";
import { DateField } from "@/components/ui/DateField";
import { TimeField } from "@/components/ui/TimeField";
import { GearIcon } from "@/components/admin/icons";
import { recurrenceStateToApiPayload, seriesToWizardRecurrenceState, type WizardRecurrenceState } from "./wizard-types";
import type { RecurrenceRule } from "@/server/events/recurrence";
import { cn } from "@/lib/cn";

const fieldClass = "border-admin-border bg-admin-card2 text-night-text focus:border-admin-primary focus:ring-admin-primary/20";

const WEEKDAY_CHIPS: { label: string; value: number }[] = [
  { label: "Пн", value: 1 },
  { label: "Вт", value: 2 },
  { label: "Ср", value: 3 },
  { label: "Чт", value: 4 },
  { label: "Пт", value: 5 },
  { label: "Сб", value: 6 },
  { label: "Вс", value: 0 },
];
const HORIZON_OPTIONS = [
  { label: "4 недели", days: 28 },
  { label: "8 недель", days: 56 },
  { label: "12 недель", days: 84 },
  { label: "24 недели", days: 168 },
];
const PUBLISH_DAYS_BEFORE_OPTIONS = [0, 1, 2, 3, 5, 7, 14];

export type EditableSeries = {
  id: string;
  recurrenceRule: RecurrenceRule;
  endDate: Date | null;
  generationHorizonDays: number;
  autoPublish: boolean;
  publishDaysBefore: number | null;
  publishAtTime: string | null;
};

// Попап "Редактировать серию" (2026-09-16, по прямому запросу пользователя)
// — те же поля, что и на шаге мастера "Повторение" (StepRecurrence.tsx), но
// для уже существующей серии, PATCH /api/event-series/[id]. КРИТИЧНО: смена
// частоты/дней/числа месяца/даты окончания серии/горизонта генерации влияет
// ТОЛЬКО на occurrences, которые генератор создаст ПОСЛЕ сохранения — уже
// созданные будущие Event НЕ переставляются и не удаляются (иначе это было
// бы тихим стиранием уже существующих событий, часть которых может уже
// иметь регистрации/билеты — CLAUDE.md §18/§51). Автопубликация
// (вкл/выкл + тайминг) — исключение: cron читает эти поля серии заново на
// каждом тике (см. series-publish.ts), поэтому она реально применяется и к
// уже сгенерированным, но ещё не опубликованным (DRAFT) occurrences.
export function SeriesRecurrenceEditor({ series, autoOpen = false }: { series: EditableSeries; autoOpen?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(autoOpen);
  const [value, setValue] = useState<WizardRecurrenceState>(() => seriesToWizardRecurrenceState(series));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function patch(p: Partial<WizardRecurrenceState>) {
    setValue((prev) => ({ ...prev, ...p }));
  }
  function toggleWeekday(day: number) {
    const has = value.daysOfWeek.includes(day);
    patch({ daysOfWeek: has ? value.daysOfWeek.filter((d) => d !== day) : [...value.daysOfWeek, day].sort() });
  }

  async function save() {
    let body: ReturnType<typeof recurrenceStateToApiPayload>;
    try {
      body = recurrenceStateToApiPayload(value);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Проверьте настройки повторения.");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/event-series/${series.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(data.message || data.error || "Не удалось сохранить изменения.");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <Button type="button" variant="adminOutline" size="sm" onClick={() => setOpen(true)}>
        <GearIcon /> Редактировать
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => !saving && setOpen(false)}>
      <div
        className="flex max-h-[90vh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-app border border-admin-border bg-admin-card p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="m-0 font-night text-lg font-bold text-night-text">Редактировать повторение</h3>
        <p className="m-0 text-xs text-admin-muted">
          Изменения затронут только ещё не сгенерированные occurrences — уже созданные будущие события останутся по старому расписанию.
        </p>

        <label className="flex flex-col gap-1.5 text-sm font-semibold text-admin-muted">
          Повторять
          <Select value={value.frequency} onChange={(e) => patch({ frequency: e.target.value as WizardRecurrenceState["frequency"] })} className={fieldClass}>
            <option value="WEEKLY">Каждую неделю</option>
            <option value="DAILY">Каждый день</option>
            <option value="MONTHLY">Каждый месяц</option>
          </Select>
        </label>

        {value.frequency === "WEEKLY" && (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-admin-muted">Дни</span>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAY_CHIPS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => toggleWeekday(d.value)}
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-app-sm border text-xs font-bold transition-colors",
                    value.daysOfWeek.includes(d.value)
                      ? "border-admin-primary bg-admin-primary text-white"
                      : "border-admin-border bg-admin-card2 text-admin-muted hover:border-admin-primary/50"
                  )}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {value.frequency === "MONTHLY" && (
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-admin-muted">
            Число месяца
            <input
              type="number"
              min={1}
              max={31}
              value={value.monthlyDayOfMonth}
              onChange={(e) => patch({ monthlyDayOfMonth: e.target.value })}
              className={cn("rounded-app-sm border px-3 py-2.5 font-body text-base", fieldClass)}
            />
          </label>
        )}

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-admin-muted">Окончание серии</span>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => patch({ endless: true })}
              className={cn(
                "rounded-app-sm border p-2.5 text-left transition-colors",
                value.endless ? "border-admin-primary bg-admin-primary/10" : "border-admin-border bg-admin-card2 hover:border-admin-primary/50"
              )}
            >
              <span className="block text-sm font-bold text-night-text">Бессрочно</span>
            </button>
            <button
              type="button"
              onClick={() => patch({ endless: false })}
              className={cn(
                "rounded-app-sm border p-2.5 text-left transition-colors",
                !value.endless ? "border-admin-primary bg-admin-primary/10" : "border-admin-border bg-admin-card2 hover:border-admin-primary/50"
              )}
            >
              <span className="block text-sm font-bold text-night-text">До даты</span>
            </button>
          </div>
          {!value.endless && <DateField value={value.endDate} onChange={(v) => patch({ endDate: v })} theme="admin" className={fieldClass} />}
        </div>

        <label className="flex flex-col gap-1.5 text-sm font-semibold text-admin-muted">
          Создавать события заранее
          <Select value={String(value.generationHorizonDays)} onChange={(e) => patch({ generationHorizonDays: Number(e.target.value) })} className={fieldClass}>
            {HORIZON_OPTIONS.map((o) => (
              <option key={o.days} value={o.days}>
                {o.label}
              </option>
            ))}
          </Select>
        </label>

        <div className="flex items-center justify-between gap-3 rounded-app-sm border border-admin-border bg-admin-card2 p-3">
          <span className="text-sm font-bold text-night-text">Автопубликация</span>
          <Switch checked={value.autoPublish} onChange={() => patch({ autoPublish: !value.autoPublish })} label="Автопубликация" />
        </div>

        {value.autoPublish && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm font-semibold text-admin-muted">
              За сколько дней
              <Select value={String(value.publishDaysBefore)} onChange={(e) => patch({ publishDaysBefore: Number(e.target.value) })} className={fieldClass}>
                {PUBLISH_DAYS_BEFORE_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {d === 0 ? "В день события" : `За ${d} ${d === 1 ? "день" : d < 5 ? "дня" : "дней"}`}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold text-admin-muted">
              В какое время
              <TimeField value={value.publishAtTime} onChange={(v) => patch({ publishAtTime: v })} theme="admin" className={fieldClass} />
            </label>
          </div>
        )}

        {error && <p className="m-0 text-sm text-red-400">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={() => setOpen(false)}>
            Отмена
          </Button>
          <Button type="button" variant="admin" disabled={saving} onClick={save}>
            {saving ? "…" : "Применить для всех"}
          </Button>
        </div>
      </div>
    </div>
  );
}
