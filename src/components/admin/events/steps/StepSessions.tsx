"use client";

import { Input, Label, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DateTimeField } from "@/components/ui/DateTimeField";
import { t } from "@/lib/i18n/dictionary";
import { PlusIcon, TrashIcon } from "@/components/admin/icons";
import type { WizardDraft, WizardMasterclassSession } from "../wizard-types";

const fieldClass =
  "border-admin-border bg-admin-card text-night-text focus:border-admin-primary focus:ring-admin-primary/20";

function emptySession(): WizardMasterclassSession {
  return { title: "", teacherId: "", startTime: "", endTime: "", room: "", level: "", capacity: "" };
}

// STEP "Sessions" — "+ Add Session" (задача). Каждая сессия сама выбирает
// преподавателя из уже существующей Teacher — отдельного шага "Teacher" нет
// (см. комментарий у EVENT_TYPE_REGISTRY.MASTERCLASS), т.к. у разных сессий
// одного мастер-класса реально бывают разные преподаватели (пример из
// задачи: Musicality / Body Movement).
export function StepSessions({
  sessions,
  onChange,
  teachers,
}: {
  sessions: WizardMasterclassSession[];
  onChange: (sessions: WizardMasterclassSession[]) => void;
  teachers: { id: string; name: string }[];
}) {
  function update(index: number, patch: Partial<WizardMasterclassSession>) {
    onChange(sessions.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }
  function remove(index: number) {
    onChange(sessions.filter((_, i) => i !== index));
  }

  return (
    <div className="flex max-w-[640px] flex-col gap-4">
      <h2 className="m-0 font-night text-lg font-bold text-night-text">Sessions</h2>

      {sessions.length === 0 && <p className="m-0 text-sm text-admin-muted">Занятий пока нет — добавьте хотя бы одно.</p>}

      {sessions.map((s, i) => (
        <Card key={i} className="border-admin-border bg-admin-card">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-1 flex-col gap-2.5">
              <Label className="text-admin-muted">
                Название занятия
                <Input value={s.title} onChange={(e) => update(i, { title: e.target.value })} className={fieldClass} />
              </Label>

              <Label className="text-admin-muted">
                Преподаватель
                <Select value={s.teacherId} onChange={(e) => update(i, { teacherId: e.target.value })} className={fieldClass}>
                  <option value="">—</option>
                  {teachers.map((tch) => (
                    <option key={tch.id} value={tch.id}>
                      {tch.name}
                    </option>
                  ))}
                </Select>
              </Label>

              <div className="flex gap-2">
                <Label className="flex-1 text-admin-muted">
                  Начало
                  <DateTimeField value={s.startTime} onChange={(v) => update(i, { startTime: v })} theme="admin" className={fieldClass} />
                </Label>
                <Label className="flex-1 text-admin-muted">
                  Окончание
                  <DateTimeField value={s.endTime} onChange={(v) => update(i, { endTime: v })} theme="admin" className={fieldClass} />
                </Label>
              </div>

              <div className="flex gap-2">
                <Label className="flex-1 text-admin-muted">
                  Зал
                  <Input value={s.room} onChange={(e) => update(i, { room: e.target.value })} className={fieldClass} />
                </Label>
                <Label className="flex-1 text-admin-muted">
                  {t.event.level}
                  <Select
                    value={s.level}
                    onChange={(e) => update(i, { level: e.target.value as WizardMasterclassSession["level"] })}
                    className={fieldClass}
                  >
                    <option value="">—</option>
                    {Object.entries(t.event.levels).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </Label>
                <Label className="w-[120px] text-admin-muted">
                  Вместимость
                  <Input
                    type="number"
                    min={1}
                    value={s.capacity}
                    onChange={(e) => update(i, { capacity: e.target.value })}
                    className={fieldClass}
                  />
                </Label>
              </div>
            </div>

            <button
              type="button"
              onClick={() => remove(i)}
              aria-label="Удалить занятие"
              className="rounded-app-sm p-1.5 text-admin-muted hover:bg-admin-card2 hover:text-red-400"
            >
              <TrashIcon />
            </button>
          </div>
        </Card>
      ))}

      <Button type="button" variant="adminOutline" onClick={() => onChange([...sessions, emptySession()])} className="self-start">
        <PlusIcon /> Add Session
      </Button>
    </div>
  );
}
