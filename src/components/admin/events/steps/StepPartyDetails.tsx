"use client";

import { Input, Label } from "@/components/ui/field";
import type { WizardDraft } from "../wizard-types";

const fieldClass =
  "border-admin-border bg-admin-card text-night-text focus:border-admin-primary focus:ring-admin-primary/20";
const checkboxClass = "h-4 w-4 rounded border-admin-border bg-admin-card accent-admin-primary";

// STEP "Party Details" — специфичные для PARTY поля (задача, раздел
// "PARTY / MASTERCLASS / JNJ CONFIGURATION ENGINE").
//
// Сокращено до 5 полей (2026-09-16, по прямому запросу пользователя) —
// Музыкальные стили/Танцполы/Артисты/Еда и напитки убраны из UI. Сами поля в
// WizardDraft.party/schema.prisma/toApiPayload НЕ удалены (уже опубликованные
// события, где они были заполнены, ничего не теряют) — просто больше не
// редактируются в мастере.
export function StepPartyDetails({ draft, onChange }: { draft: WizardDraft; onChange: (patch: Partial<WizardDraft["party"]>) => void }) {
  const p = draft.party;
  return (
    <div className="flex w-full flex-col gap-3.5">
      <h2 className="m-0 font-night text-lg font-bold text-night-text">О вечеринке</h2>

      <div className="grid gap-3.5 sm:grid-cols-2">
        <Label className="text-admin-muted">
          Диджеи (через запятую)
          <Input value={p.djs} onChange={(e) => onChange({ djs: e.target.value })} className={fieldClass} />
        </Label>
        <Label className="text-admin-muted">
          Дресс-код
          <Input value={p.dressCode} onChange={(e) => onChange({ dressCode: e.target.value })} className={fieldClass} />
        </Label>
        <Label className="text-admin-muted">
          Фотограф
          <Input value={p.photographer} onChange={(e) => onChange({ photographer: e.target.value })} className={fieldClass} />
        </Label>
      </div>

      <div className="flex flex-wrap gap-5">
        <label className="flex items-center gap-2 text-sm text-admin-muted">
          <input type="checkbox" checked={p.parking} onChange={(e) => onChange({ parking: e.target.checked })} className={checkboxClass} />
          Парковка
        </label>
        <label className="flex items-center gap-2 text-sm text-admin-muted">
          <input
            type="checkbox"
            checked={p.cloakroom}
            onChange={(e) => onChange({ cloakroom: e.target.checked })}
            className={checkboxClass}
          />
          Гардероб
        </label>
      </div>
    </div>
  );
}
