"use client";

import { Input, Label, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DateTimeField } from "@/components/ui/DateTimeField";
import { PlusIcon, TrashIcon } from "@/components/admin/icons";
import type { WizardProgramItem } from "../wizard-types";

const fieldClass =
  "border-admin-border bg-admin-card text-night-text focus:border-admin-primary focus:ring-admin-primary/20";

const TYPE_LABELS: Record<WizardProgramItem["type"], string> = {
  WORKSHOP: "Мастер-класс",
  PARTY: "Вечеринка",
  COMPETITION: "Конкурс",
  OTHER: "Другое",
};

function emptyItem(): WizardProgramItem {
  return { title: "", type: "WORKSHOP", startTime: "", endTime: "", teacherId: "" };
}

// STEP "Программа" (Events Engine, этап 6) — тот же паттерн, что и
// StepSessions у MASTERCLASS: каждый пункт программы сам выбирает
// преподавателя (актуально в основном для WORKSHOP, но поле доступно для
// всех типов — не усложняем условной видимостью). Привязка пункта к
// дочернему Event (linkedEvent) в этой версии Wizard не редактируется —
// см. комментарий у festivalProgramItemSchema.
export function StepFestivalProgram({
  items,
  onChange,
  teachers,
}: {
  items: WizardProgramItem[];
  onChange: (items: WizardProgramItem[]) => void;
  teachers: { id: string; name: string }[];
}) {
  function update(index: number, patch: Partial<WizardProgramItem>) {
    onChange(items.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }
  function remove(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <h2 className="m-0 font-night text-lg font-bold text-night-text">Программа</h2>
      <p className="m-0 -mt-2 text-sm text-admin-muted">Расписание фестиваля по дням — мастер-классы, вечеринки, конкурсы.</p>

      {items.length === 0 && <p className="m-0 text-sm text-admin-muted">Пунктов программы пока нет.</p>}

      {items.map((it, i) => (
        <Card key={i} className="border-admin-border bg-admin-card">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-1 flex-col gap-2.5">
              <Label className="text-admin-muted">
                Название
                <Input value={it.title} onChange={(e) => update(i, { title: e.target.value })} className={fieldClass} />
              </Label>

              <div className="flex gap-2">
                <Label className="flex-1 text-admin-muted">
                  Тип
                  <Select value={it.type} onChange={(e) => update(i, { type: e.target.value as WizardProgramItem["type"] })} className={fieldClass}>
                    {Object.entries(TYPE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </Label>
                <Label className="flex-1 text-admin-muted">
                  Преподаватель (необязательно)
                  <Select value={it.teacherId} onChange={(e) => update(i, { teacherId: e.target.value })} className={fieldClass}>
                    <option value="">—</option>
                    {teachers.map((tch) => (
                      <option key={tch.id} value={tch.id}>
                        {tch.name}
                      </option>
                    ))}
                  </Select>
                </Label>
              </div>

              <div className="flex gap-2">
                <Label className="flex-1 text-admin-muted">
                  Начало
                  <DateTimeField required value={it.startTime} onChange={(v) => update(i, { startTime: v })} theme="admin" className={fieldClass} />
                </Label>
                <Label className="flex-1 text-admin-muted">
                  Окончание (необязательно)
                  <DateTimeField value={it.endTime} onChange={(v) => update(i, { endTime: v })} theme="admin" className={fieldClass} />
                </Label>
              </div>
            </div>

            <button
              type="button"
              onClick={() => remove(i)}
              aria-label="Удалить пункт программы"
              className="rounded-app-sm p-1.5 text-admin-muted hover:bg-admin-card2 hover:text-red-400"
            >
              <TrashIcon />
            </button>
          </div>
        </Card>
      ))}

      <Button type="button" variant="adminOutline" onClick={() => onChange([...items, emptyItem()])} className="self-start">
        <PlusIcon /> Добавить пункт программы
      </Button>
    </div>
  );
}
