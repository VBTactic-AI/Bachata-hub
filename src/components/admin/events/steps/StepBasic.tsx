"use client";

import { t } from "@/lib/i18n/dictionary";
import { Input, Label, Select, Textarea } from "@/components/ui/field";
import { EventMediaManager } from "../EventMediaManager";
import type { WizardDraft, WizardMediaItem } from "../wizard-types";

const fieldClass =
  "border-admin-border bg-admin-card text-night-text focus:border-admin-primary focus:ring-admin-primary/20";
const groupClass = "flex flex-col gap-3 rounded-app-sm border border-admin-border bg-admin-card2/40 p-3.5";
const groupLabelClass = "m-0 text-[10.5px] font-semibold uppercase tracking-wide text-admin-muted";

// Основная информация + место проведения (редизайн 2026-09-16, по прямому
// запросу пользователя, макет согласован заранее) — раньше это были два
// отдельных шага ("basic" и "location"), объединены в один экран, чтобы
// поля не "скакали" между шагами туда-сюда. Поле "Организатор" сюда
// сознательно НЕ вернулось — по прямому решению пользователя оно больше не
// редактируется в мастере, а подтягивается автоматически из школы/профиля
// организатора при создании черновика (см. admin/content/page.tsx).
//
// Правка по итогам UX-ревью (2026-09-16, "Event Engine Redline"): поля
// сгруппированы в подсекции с эйбрау-заголовком (Основное/Место
// проведения/Дополнительно) — раньше шли единым потоком без пауз для глаза.
// Широта/долгота убраны из мастера полностью (по прямому запросу
// пользователя) — поля остаются в схеме/API (optional, см. schemas.ts) для
// уже существующих событий, которые их заполнили раньше, но новый черновик
// их больше не запрашивает и не отправляет (toApiPayload их не шлёт вовсе).
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
    <div className="flex w-full flex-col gap-4">
      <h2 className="m-0 font-night text-lg font-bold text-night-text">Основная информация</h2>

      <div className={groupClass}>
        <p className={groupLabelClass}>Основное</p>
        <Label className="text-admin-muted">
          {t.event.addEventForm.titleField}
          <Input required value={draft.title} onChange={(e) => onChange({ title: e.target.value })} className={fieldClass} />
        </Label>
        <Label className="text-admin-muted">
          {t.event.description}
          <Textarea value={draft.description} onChange={(e) => onChange({ description: e.target.value })} className={fieldClass} />
        </Label>
      </div>

      <div className={groupClass}>
        <p className={groupLabelClass}>Место проведения</p>
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
      </div>

      <div className={groupClass}>
        <p className={groupLabelClass}>Дополнительно</p>
        <Label className="text-admin-muted">
          {t.event.tags} ({t.event.tagsHint})
          <Input value={draft.tags} onChange={(e) => onChange({ tags: e.target.value })} className={fieldClass} />
        </Label>
      </div>

      <EventMediaManager eventId={draft.id ?? null} media={draft.media} onChange={(media: WizardMediaItem[]) => onChange({ media })} />
    </div>
  );
}
