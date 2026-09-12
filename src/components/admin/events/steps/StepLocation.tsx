"use client";

import { t } from "@/lib/i18n/dictionary";
import { Input, Label, Select } from "@/components/ui/field";
import type { WizardDraft } from "../wizard-types";

const fieldClass =
  "border-admin-border bg-admin-card text-night-text focus:border-admin-primary focus:ring-admin-primary/20";

export function StepLocation({
  draft,
  onChange,
  cities,
  ownedSchools,
}: {
  draft: WizardDraft;
  onChange: (patch: Partial<WizardDraft>) => void;
  cities: { id: string; nameRu: string }[];
  ownedSchools: { id: string; name: string }[];
}) {
  return (
    <div className="flex max-w-[560px] flex-col gap-3.5">
      <h2 className="m-0 font-night text-lg font-bold text-night-text">Location</h2>

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

      {ownedSchools.length > 0 ? (
        <Label className="text-admin-muted">
          {t.event.organizer}
          <Select value={draft.schoolId} onChange={(e) => onChange({ schoolId: e.target.value })} className={fieldClass}>
            <option value="">{t.event.addEventForm.organizerPlaceholder}</option>
            {ownedSchools.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Label>
      ) : (
        <Label className="text-admin-muted">
          {t.event.organizer}
          <Input
            placeholder={t.event.addEventForm.organizerPlaceholder}
            value={draft.organizerName}
            onChange={(e) => onChange({ organizerName: e.target.value })}
            className={fieldClass}
          />
        </Label>
      )}

      <Label className="text-admin-muted">
        {t.event.place}
        <Input required value={draft.venueName} onChange={(e) => onChange({ venueName: e.target.value })} className={fieldClass} />
      </Label>

      <Label className="text-admin-muted">
        {t.event.addEventForm.addressLabel}
        <Input value={draft.venueAddress} onChange={(e) => onChange({ venueAddress: e.target.value })} className={fieldClass} />
      </Label>

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
    </div>
  );
}
