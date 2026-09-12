"use client";

import { Input, Label } from "@/components/ui/field";
import type { WizardDraft } from "../wizard-types";

const fieldClass =
  "border-admin-border bg-admin-card text-night-text focus:border-admin-primary focus:ring-admin-primary/20";
const checkboxClass = "h-4 w-4 rounded border-admin-border bg-admin-card accent-admin-primary";

// STEP "Party Details" — специфичные для PARTY поля (задача, раздел
// "PARTY / MASTERCLASS / JNJ CONFIGURATION ENGINE").
export function StepPartyDetails({ draft, onChange }: { draft: WizardDraft; onChange: (patch: Partial<WizardDraft["party"]>) => void }) {
  const p = draft.party;
  return (
    <div className="flex max-w-[560px] flex-col gap-3.5">
      <h2 className="m-0 font-night text-lg font-bold text-night-text">Party details</h2>

      <Label className="text-admin-muted">
        Music styles (через запятую)
        <Input value={p.musicStyles} onChange={(e) => onChange({ musicStyles: e.target.value })} className={fieldClass} />
      </Label>
      <Label className="text-admin-muted">
        DJs (через запятую)
        <Input value={p.djs} onChange={(e) => onChange({ djs: e.target.value })} className={fieldClass} />
      </Label>
      <Label className="text-admin-muted">
        Dance floors (через запятую)
        <Input value={p.danceFloors} onChange={(e) => onChange({ danceFloors: e.target.value })} className={fieldClass} />
      </Label>
      <Label className="text-admin-muted">
        Artists (через запятую)
        <Input value={p.artists} onChange={(e) => onChange({ artists: e.target.value })} className={fieldClass} />
      </Label>
      <Label className="text-admin-muted">
        Dress code
        <Input value={p.dressCode} onChange={(e) => onChange({ dressCode: e.target.value })} className={fieldClass} />
      </Label>
      <Label className="text-admin-muted">
        Photographer
        <Input value={p.photographer} onChange={(e) => onChange({ photographer: e.target.value })} className={fieldClass} />
      </Label>
      <Label className="text-admin-muted">
        Food &amp; drinks
        <Input value={p.foodAndDrinks} onChange={(e) => onChange({ foodAndDrinks: e.target.value })} className={fieldClass} />
      </Label>

      <label className="flex items-center gap-2 text-sm text-admin-muted">
        <input type="checkbox" checked={p.parking} onChange={(e) => onChange({ parking: e.target.checked })} className={checkboxClass} />
        Parking
      </label>
      <label className="flex items-center gap-2 text-sm text-admin-muted">
        <input
          type="checkbox"
          checked={p.cloakroom}
          onChange={(e) => onChange({ cloakroom: e.target.checked })}
          className={checkboxClass}
        />
        Cloakroom
      </label>
    </div>
  );
}
