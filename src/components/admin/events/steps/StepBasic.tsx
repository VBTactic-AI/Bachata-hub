"use client";

import { t } from "@/lib/i18n/dictionary";
import { Input, Label, Select, Textarea } from "@/components/ui/field";
import { EventMediaManager } from "../EventMediaManager";
import type { WizardDraft, WizardMediaItem } from "../wizard-types";

const fieldClass =
  "border-admin-border bg-admin-card text-night-text focus:border-admin-primary focus:ring-admin-primary/20";

// Основная информация + место проведения (редизайн 2026-09-16, по прямому
// запросу пользователя, макет согласован заранее) — раньше это были два
// отдельных шага ("basic" и "location"), объединены в один экран, чтобы
// поля не "скакали" между шагами туда-сюда. Поле "Организатор" сюда
// сознательно НЕ вернулось — по прямому решению пользователя оно больше не
// редактируется в мастере, а подтягивается автоматически из школы/профиля
// организатора при создании черновика (см. admin/content/page.tsx).
export function StepBasic({
  draft,
  onChange,
  cities,
}: {
  draft: WizardDraft;
  onChange: (patch: Partial<WizardDraft>) => void;
  cities: { id: string; nameRu: string }[];
}) {
  return (
    <div className="flex w-full flex-col gap-3.5">
      <h2 className="m-0 font-night text-lg font-bold text-night-text">Основная информация</h2>

      <Label className="text-admin-muted">
        {t.event.addEventForm.titleField}
        <Input required value={draft.title} onChange={(e) => onChange({ title: e.target.value })} className={fieldClass} />
      </Label>

      <Label className="text-admin-muted">
        {t.event.description}
        <Textarea value={draft.description} onChange={(e) => onChange({ description: e.target.value })} className={fieldClass} />
      </Label>

      <div className="grid gap-3.5 sm:grid-cols-2">
        <Label className="text-admin-muted">
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
          {t.event.city}
          <Select value={draft.cityId} onChange={(e) => onChange({ cityId: e.target.value })} className={fieldClass}>
            <option value="">—</option>
            {cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nameRu}
              </option>
            ))}
          </Select>
        </Label>
      </div>

      <div className="grid gap-3.5 sm:grid-cols-2">
        <Label className="text-admin-muted">
          {t.event.place}
          <Input required value={draft.venueName} onChange={(e) => onChange({ venueName: e.target.value })} className={fieldClass} />
        </Label>
        <Label className="text-admin-muted">
          {t.event.addEventForm.addressLabel}
          <Input value={draft.venueAddress} onChange={(e) => onChange({ venueAddress: e.target.value })} className={fieldClass} />
        </Label>
      </div>

      <div className="flex gap-3">
        <Label className="flex-1 text-admin-muted">
          Широта (необязательно)
          <Input
            type="number"
            step="any"
            value={draft.latitude}
            onChange={(e) => onChange({ latitude: e.target.value })}
            className={fieldClass}
          />
        </Label>
        <Label className="flex-1 text-admin-muted">
          Долгота (необязательно)
          <Input
            type="number"
            step="any"
            value={draft.longitude}
            onChange={(e) => onChange({ longitude: e.target.value })}
            className={fieldClass}
          />
        </Label>
      </div>

      <Label className="text-admin-muted">
        {t.event.tags} ({t.event.tagsHint})
        <Input value={draft.tags} onChange={(e) => onChange({ tags: e.target.value })} className={fieldClass} />
      </Label>

      <EventMediaManager eventId={draft.id ?? null} media={draft.media} onChange={(media: WizardMediaItem[]) => onChange({ media })} />
    </div>
  );
}
