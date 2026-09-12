"use client";

import { t } from "@/lib/i18n/dictionary";
import { Label } from "@/components/ui/field";
import { DateTimeField } from "@/components/ui/DateTimeField";
import type { WizardDraft } from "../wizard-types";

const fieldClass =
  "border-admin-border bg-admin-card text-night-text focus:border-admin-primary focus:ring-admin-primary/20";

export function StepDateTime({ draft, onChange }: { draft: WizardDraft; onChange: (patch: Partial<WizardDraft>) => void }) {
  return (
    <div className="flex max-w-[560px] flex-col gap-3.5">
      <h2 className="m-0 font-night text-lg font-bold text-night-text">Date &amp; time</h2>

      <Label className="text-admin-muted">
        {t.event.date} / {t.event.time} — начало
        <DateTimeField required value={draft.startsAt} onChange={(v) => onChange({ startsAt: v })} theme="admin" className={fieldClass} />
      </Label>

      <Label className="text-admin-muted">
        {t.event.date} / {t.event.time} — окончание (необязательно)
        <DateTimeField value={draft.endsAt} onChange={(v) => onChange({ endsAt: v })} theme="admin" className={fieldClass} />
      </Label>
    </div>
  );
}
