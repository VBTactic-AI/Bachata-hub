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

// "Способ доступа" (2026-09-16, Ticket Engine v2) — чисто UI-подсказка (см.
// комментарий у Event.ticketingMode в schema.prisma): определяет, какой
// раздел вкладки "Билеты и Pass" показать по умолчанию после публикации.
// Ничего не блокирует — организатор технически может завести и TicketType,
// и Pass независимо от выбора здесь.
const TICKETING_MODE_OPTIONS: { value: WizardDraft["ticketingMode"]; label: string; hint: string }[] = [
  { value: "FREE", label: "Бесплатное событие", hint: "Без продажи билетов — просто регистрация." },
  { value: "TICKETS", label: "Продажа билетов", hint: "Простые билеты на это событие (Teacher/Dancer/…)." },
  { value: "PASSES", label: "Продажа Pass", hint: "Доступ к нескольким пунктам программы (фестиваль/интенсив)." },
  { value: "TICKETS_AND_PASSES", label: "Билеты + Pass", hint: "И то, и другое одновременно." },
];

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

  const showTicketsHint = draft.ticketingMode === "TICKETS" || draft.ticketingMode === "TICKETS_AND_PASSES";
  const showPassesHint = draft.ticketingMode === "PASSES" || draft.ticketingMode === "TICKETS_AND_PASSES";

  return (
    <div className="flex max-w-[640px] flex-col gap-3.5">
      <h2 className="m-0 font-night text-lg font-bold text-night-text">Билеты и регистрация</h2>

      <div className="rounded-app-sm border border-admin-border p-3">
        <p className="m-0 mb-2 text-sm font-semibold text-night-text">Способ доступа</p>
        <div className="flex flex-col gap-1.5">
          {TICKETING_MODE_OPTIONS.map((opt) => (
            <label key={opt.value} className="flex items-start gap-2 text-sm text-night-text">
              <input
                type="radio"
                name="ticketingMode"
                checked={draft.ticketingMode === opt.value}
                onChange={() => onChange({ ticketingMode: opt.value })}
                className="mt-0.5 accent-admin-primary"
              />
              <span>
                {opt.label}
                <span className="block text-xs text-admin-muted">{opt.hint}</span>
              </span>
            </label>
          ))}
        </div>
        {(showTicketsHint || showPassesHint) &&
          (draft.id ? (
            <a
              href={`/admin/content/${draft.id}/passes`}
              className="mt-2 block text-xs text-admin-primaryHover hover:underline"
            >
              Настроить {showTicketsHint && showPassesHint ? "билеты и Pass" : showTicketsHint ? "билеты" : "Pass"} →
            </a>
          ) : (
            <p className="m-0 mt-2 text-xs text-admin-muted">
              Сохраните черновик, чтобы настроить {showTicketsHint && showPassesHint ? "билеты и Pass" : showTicketsHint ? "билеты" : "Pass"} —
              это делается на отдельной вкладке "Билеты и Pass" в управлении событием.
            </p>
          ))}
      </div>

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
        <p className="m-0 text-sm font-semibold text-night-text">Варианты билета (текстом, для карточки события)</p>
        <p className="m-0 text-xs text-admin-muted">
          Это просто отображаемые строки, без учёта мест и продаж — для настоящих продаваемых билетов используйте
          «Способ доступа» выше.
        </p>
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
          <PlusIcon /> Добавить вариант билета
        </Button>
      </div>
    </div>
  );
}
