"use client";

import { t } from "@/lib/i18n/dictionary";
import { Input, Label, Select, Textarea } from "@/components/ui/field";
import { EventMediaManager } from "../EventMediaManager";
import type { WizardDraft, WizardMediaItem } from "../wizard-types";

const fieldClass =
  "border-admin-border bg-admin-card text-night-text focus:border-admin-primary focus:ring-admin-primary/20";

export function StepBasic({ draft, onChange }: { draft: WizardDraft; onChange: (patch: Partial<WizardDraft>) => void }) {
  return (
    <div className="flex max-w-[720px] flex-col gap-3.5">
      <h2 className="m-0 font-night text-lg font-bold text-night-text">Основная информация</h2>

      <div className="max-w-[560px]">
        <Label className="text-admin-muted">
          {t.event.addEventForm.titleField}
          <Input required value={draft.title} onChange={(e) => onChange({ title: e.target.value })} className={fieldClass} />
        </Label>
      </div>

      <div className="max-w-[560px]">
        <Label className="text-admin-muted">
          {t.event.description}
          <Textarea value={draft.description} onChange={(e) => onChange({ description: e.target.value })} className={fieldClass} />
        </Label>
      </div>

      <EventMediaManager eventId={draft.id ?? null} media={draft.media} onChange={(media: WizardMediaItem[]) => onChange({ media })} />

      <Label className="max-w-[560px] text-admin-muted">
        {t.event.level}
        <Select value={draft.level} onChange={(e) => onChange({ level: e.target.value as WizardDraft["level"] })} className={fieldClass}>
          {Object.entries(t.event.levels).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </Select>
      </Label>

      <Label className="text-admin-muted">
        {t.event.tags} ({t.event.tagsHint})
        <Input value={draft.tags} onChange={(e) => onChange({ tags: e.target.value })} className={fieldClass} />
      </Label>
    </div>
  );
}
