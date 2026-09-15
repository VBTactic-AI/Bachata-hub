"use client";

import { t } from "@/lib/i18n/dictionary";
import { Input, Label } from "@/components/ui/field";
import type { WizardDraft } from "../wizard-types";

const fieldClass =
  "border-admin-border bg-admin-card text-night-text focus:border-admin-primary focus:ring-admin-primary/20";
const checkboxClass = "h-4 w-4 rounded border-admin-border bg-admin-card accent-admin-primary";

// "Способ доступа" (2026-09-16, Ticket Engine v2) — чисто UI-подсказка (см.
// комментарий у Event.ticketingMode в schema.prisma): определяет, какой
// раздел вкладки "Билеты и Pass" показать по умолчанию после публикации.
// Ничего не блокирует — организатор технически может завести и TicketType,
// и Pass независимо от выбора здесь.
const TICKETING_MODE_OPTIONS: { value: WizardDraft["ticketingMode"]; label: string; hint: string }[] = [
  { value: "FREE", label: "Бесплатное событие", hint: "Без продажи билетов." },
  { value: "TICKETS", label: "Продажа билетов", hint: "Простые билеты на это событие (Teacher/Dancer/…)." },
  { value: "PASSES", label: "Продажа Pass", hint: "Доступ к нескольким пунктам программы (фестиваль/интенсив)." },
  { value: "TICKETS_AND_PASSES", label: "Билеты + Pass", hint: "И то, и другое одновременно." },
];

// STEP "Tickets / registration" — общий для PARTY (Early Bird/Regular/At
// Door) и MASTERCLASS (Solo/Couple/Masterclass+Party), задача явно просит не
// дублировать эту структуру под каждый тип.
export function StepTickets({ draft, onChange }: { draft: WizardDraft; onChange: (patch: Partial<WizardDraft>) => void }) {
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

      <label className="flex items-center gap-2 text-sm text-admin-muted">
        <input
          type="checkbox"
          checked={draft.registrationEnabled}
          onChange={(e) => onChange({ registrationEnabled: e.target.checked })}
          className={checkboxClass}
        />
        Показывать блок регистрации на публичной странице
      </label>

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
    </div>
  );
}
