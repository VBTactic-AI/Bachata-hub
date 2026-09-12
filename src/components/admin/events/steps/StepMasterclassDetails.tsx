"use client";

import { Input, Label } from "@/components/ui/field";
import type { WizardDraft } from "../wizard-types";

const fieldClass =
  "border-admin-border bg-admin-card text-night-text focus:border-admin-primary focus:ring-admin-primary/20";
const checkboxClass = "h-4 w-4 rounded border-admin-border bg-admin-card accent-admin-primary";

export function StepMasterclassDetails({
  draft,
  onChange,
}: {
  draft: WizardDraft;
  onChange: (patch: Partial<WizardDraft["masterclass"]>) => void;
}) {
  const m = draft.masterclass;
  return (
    <div className="flex max-w-[560px] flex-col gap-3.5">
      <h2 className="m-0 font-night text-lg font-bold text-night-text">Details</h2>

      <Label className="text-admin-muted">
        Style
        <Input value={m.style} onChange={(e) => onChange({ style: e.target.value })} className={fieldClass} />
      </Label>

      <Label className="text-admin-muted">
        Format
        <Input
          placeholder="Интенсив / цикл занятий / …"
          value={m.format}
          onChange={(e) => onChange({ format: e.target.value })}
          className={fieldClass}
        />
      </Label>

      <label className="flex items-center gap-2 text-sm text-admin-muted">
        <input
          type="checkbox"
          checked={m.partnerRequired}
          onChange={(e) => onChange({ partnerRequired: e.target.checked })}
          className={checkboxClass}
        />
        Partner required
      </label>
    </div>
  );
}
