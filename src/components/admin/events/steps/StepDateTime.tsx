"use client";

import { t } from "@/lib/i18n/dictionary";
import { Label } from "@/components/ui/field";
import { DateTimeField } from "@/components/ui/DateTimeField";
import type { WizardDraft } from "../wizard-types";

const fieldClass =
  "border-admin-border bg-admin-card text-night-text focus:border-admin-primary focus:ring-admin-primary/20";

export function StepDateTime({ draft, onChange }: { draft: WizardDraft; onChange: (patch: Partial<WizardDraft>) => void }) {
  return (
    <div className="flex w-full flex-col gap-3.5">
      <h2 className="m-0 font-night text-lg font-bold text-night-text">Дата и время</h2>

      <div className="grid gap-3.5 sm:grid-cols-2">
        <Label className="text-admin-muted">
          {t.event.date} / {t.event.time} — начало
          <DateTimeField required value={draft.startsAt} onChange={(v) => onChange({ startsAt: v })} theme="admin" className={fieldClass} />
        </Label>

        <Label className="text-admin-muted">
          {t.event.date} / {t.event.time} — окончание (необязательно)
          <DateTimeField value={draft.endsAt} onChange={(v) => onChange({ endsAt: v })} theme="admin" className={fieldClass} />
        </Label>
      </div>

      <label className="flex items-center gap-2 text-sm text-admin-muted">
        <input
          type="checkbox"
          checked={draft.certainty === "TENTATIVE"}
          onChange={(e) => onChange({ certainty: e.target.checked ? "TENTATIVE" : "CONFIRMED" })}
          className="h-4 w-4 rounded border-admin-border accent-admin-primary"
        />
        {t.event.certaintyTentativeLabel}
      </label>
    </div>
  );
}
