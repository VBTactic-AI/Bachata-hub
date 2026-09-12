"use client";

import { t } from "@/lib/i18n/dictionary";
import { Input, Label } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { PlusIcon, TrashIcon } from "@/components/admin/icons";
import type { WizardDraft, WizardPriceOption } from "../wizard-types";

const fieldClass =
  "border-admin-border bg-admin-card text-night-text focus:border-admin-primary focus:ring-admin-primary/20";
const checkboxClass = "h-4 w-4 rounded border-admin-border bg-admin-card accent-admin-primary";

function emptyOption(): WizardPriceOption {
  return { label: "", price: "", currency: "BYN" };
}

// STEP "Tickets / registration" — общий для PARTY (Early Bird/Regular/At
// Door) и MASTERCLASS (Solo/Couple/Masterclass+Party), задача явно просит не
// дублировать эту структуру под каждый тип.
export function StepTickets({ draft, onChange }: { draft: WizardDraft; onChange: (patch: Partial<WizardDraft>) => void }) {
  function updateOption(i: number, patch: Partial<WizardPriceOption>) {
    onChange({ priceOptions: draft.priceOptions.map((o, idx) => (idx === i ? { ...o, ...patch } : o)) });
  }
  function removeOption(i: number) {
    onChange({ priceOptions: draft.priceOptions.filter((_, idx) => idx !== i) });
  }

  return (
    <div className="flex max-w-[640px] flex-col gap-3.5">
      <h2 className="m-0 font-night text-lg font-bold text-night-text">Tickets / registration</h2>

      <Label className="text-admin-muted">
        {t.event.price} текстом
        <Input
          placeholder={t.event.addEventForm.pricePlaceholder}
          value={draft.priceText}
          onChange={(e) => onChange({ priceText: e.target.value })}
          className={fieldClass}
        />
      </Label>

      <Label className="text-admin-muted">
        {t.event.registerExternal}
        <Input
          type="url"
          placeholder={t.event.addEventForm.linkPlaceholder}
          value={draft.externalLinkUrl}
          onChange={(e) => onChange({ externalLinkUrl: e.target.value })}
          className={fieldClass}
        />
      </Label>

      <Label className="text-admin-muted">
        Вместимость (необязательно)
        <Input
          type="number"
          min={1}
          value={draft.capacity}
          onChange={(e) => onChange({ capacity: e.target.value })}
          className={fieldClass}
        />
      </Label>

      <label className="flex items-center gap-2 text-sm text-admin-muted">
        <input
          type="checkbox"
          checked={draft.registrationEnabled}
          onChange={(e) => onChange({ registrationEnabled: e.target.checked })}
          className={checkboxClass}
        />
        Показывать блок регистрации на публичной странице
      </label>

      <div className="flex flex-col gap-2">
        <p className="m-0 text-sm font-semibold text-night-text">Варианты билета</p>
        {draft.priceOptions.map((o, i) => (
          <div key={i} className="flex items-end gap-2">
            <Label className="flex-1 text-admin-muted">
              Название (Early Bird / Solo / …)
              <Input value={o.label} onChange={(e) => updateOption(i, { label: e.target.value })} className={fieldClass} />
            </Label>
            <Label className="w-[110px] text-admin-muted">
              Цена
              <Input type="number" min={0} value={o.price} onChange={(e) => updateOption(i, { price: e.target.value })} className={fieldClass} />
            </Label>
            <Label className="w-[80px] text-admin-muted">
              Валюта
              <Input value={o.currency} onChange={(e) => updateOption(i, { currency: e.target.value })} className={fieldClass} />
            </Label>
            <button
              type="button"
              onClick={() => removeOption(i)}
              aria-label="Убрать вариант"
              className="mb-0.5 rounded-app-sm p-2 text-admin-muted hover:bg-admin-card2 hover:text-red-400"
            >
              <TrashIcon />
            </button>
          </div>
        ))}
        <Button
          type="button"
          variant="adminOutline"
          onClick={() => onChange({ priceOptions: [...draft.priceOptions, emptyOption()] })}
          className="self-start"
        >
          <PlusIcon /> Add ticket type
        </Button>
      </div>
    </div>
  );
}
