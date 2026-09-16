"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { Switch } from "@/components/admin/Switch";
import { DateField } from "@/components/ui/DateField";
import { TimeField } from "@/components/ui/TimeField";
import { CheckCircleIcon } from "@/components/admin/icons";
import { recurrenceStateToApiPayload, type WizardRecurrenceState } from "../wizard-types";
import { cn } from "@/lib/cn";

const fieldClass = "border-admin-border bg-admin-card text-night-text focus:border-admin-primary focus:ring-admin-primary/20";

// Пн..Вс в привычном порядке отображения -> значение 0=вс..6=сб (см.
// src/server/events/recurrence.ts — совпадает с Date.getUTCDay()).
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

// Шаг "Повторение" — появляется только если на шаге "Публикация" отмечено
// "Сделать регулярным" (Recurring Events v2). Само событие УЖЕ опубликовано
// на этот момент (это финальный шаг, не альтернатива публикации) — этот шаг
// только заводит EventSeries и линкует событие как occurrence №1
// (createSeriesFromEvent, event-series-service.ts). Даты этого события
// (название/место/время) здесь не переспрашиваются — сервер берёт их из
// самого Event.
export function StepRecurrence({
  eventId,
  eventTitle,
  eventDateTimeLabel,
  value,
  onChange,
  onSaved,
}: {
  eventId: string;
  eventTitle: string;
  eventDateTimeLabel: string;
  value: WizardRecurrenceState;
  onChange: (patch: Partial<WizardRecurrenceState>) => void;
  onSaved: (seriesId: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleWeekday(day: number) {
    const has = value.daysOfWeek.includes(day);
    onChange({ daysOfWeek: has ? value.daysOfWeek.filter((d) => d !== day) : [...value.daysOfWeek, day].sort() });
  }

  async function handleSave() {
    setError(null);
    let payload: ReturnType<typeof recurrenceStateToApiPayload>;
    try {
      payload = recurrenceStateToApiPayload(value);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Проверьте настройки повторения.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/event-drafts/${eventId}/make-recurring`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.message || "Не удалось создать регулярную серию.");
        return;
      }
      onSaved(body.series.id);
    } catch {
      setError("Не удалось сохранить — проверьте соединение.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <h2 className="m-0 font-night text-lg font-bold text-night-text">Повторение</h2>

      <div className="flex items-start gap-2.5 rounded-app-sm border border-night-success/30 bg-night-success/10 p-3">
        <span className="mt-0.5 text-night-success">
          <CheckCircleIcon />
        </span>
        <p className="m-0 text-sm text-night-text">
          «{eventTitle}» опубликовано — {eventDateTimeLabel}. Осталось настроить, как часто оно повторяется.
        </p>
      </div>

      <label className="flex flex-col gap-1.5 text-sm font-semibold text-admin-muted">
        Повторять
        <Select value={value.frequency} onChange={(e) => onChange({ frequency: e.target.value as WizardRecurrenceState["frequency"] })} className={fieldClass}>
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
            onChange={(e) => onChange({ monthlyDayOfMonth: e.target.value })}
            className={cn("rounded-app-sm border px-3 py-2.5 font-body text-base", fieldClass)}
          />
        </label>
      )}

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-admin-muted">Окончание серии</span>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onChange({ endless: true })}
            className={cn(
              "rounded-app-sm border p-2.5 text-left transition-colors",
              value.endless ? "border-admin-primary bg-admin-primary/10" : "border-admin-border bg-admin-card2 hover:border-admin-primary/50"
            )}
          >
            <span className="block text-sm font-bold text-night-text">Бессрочно</span>
            <span className="block text-xs text-admin-muted">Пока не остановите вручную</span>
          </button>
          <button
            type="button"
            onClick={() => onChange({ endless: false })}
            className={cn(
              "rounded-app-sm border p-2.5 text-left transition-colors",
              !value.endless ? "border-admin-primary bg-admin-primary/10" : "border-admin-border bg-admin-card2 hover:border-admin-primary/50"
            )}
          >
            <span className="block text-sm font-bold text-night-text">До даты</span>
            <span className="block text-xs text-admin-muted">Например, конец сезона</span>
          </button>
        </div>
        {!value.endless && (
          <DateField value={value.endDate} onChange={(v) => onChange({ endDate: v })} theme="admin" className={fieldClass} />
        )}
      </div>

      <label className="flex flex-col gap-1.5 text-sm font-semibold text-admin-muted">
        Создавать события заранее
        <Select
          value={String(value.generationHorizonDays)}
          onChange={(e) => onChange({ generationHorizonDays: Number(e.target.value) })}
          className={fieldClass}
        >
          {HORIZON_OPTIONS.map((o) => (
            <option key={o.days} value={o.days}>
              {o.label}
            </option>
          ))}
        </Select>
      </label>

      <div className="flex items-center justify-between gap-3 rounded-app-sm border border-admin-border bg-admin-card2 p-3">
        <span>
          <span className="block text-sm font-bold text-night-text">Автопубликация</span>
          <span className="block text-xs text-admin-muted">Иначе события остаются черновиками до ручной публикации</span>
        </span>
        <Switch checked={value.autoPublish} onChange={() => onChange({ autoPublish: !value.autoPublish })} label="Автопубликация" />
      </div>

      {value.autoPublish && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-admin-muted">
            За сколько дней
            <Select
              value={String(value.publishDaysBefore)}
              onChange={(e) => onChange({ publishDaysBefore: Number(e.target.value) })}
              className={fieldClass}
            >
              {PUBLISH_DAYS_BEFORE_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {d === 0 ? "В день события" : `За ${d} ${d === 1 ? "день" : d < 5 ? "дня" : "дней"}`}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-admin-muted">
            В какое время
            <TimeField value={value.publishAtTime} onChange={(v) => onChange({ publishAtTime: v })} theme="admin" className={fieldClass} />
          </label>
        </div>
      )}

      {error && <p className="m-0 text-sm text-red-400">{error}</p>}

      <Button type="button" variant="admin" disabled={saving} onClick={handleSave}>
        {saving ? "…" : "Сохранить регулярность"}
      </Button>
    </div>
  );
}
