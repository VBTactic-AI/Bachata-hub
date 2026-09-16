"use client";

import { t } from "@/lib/i18n/dictionary";
import { Input, Label } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import type { WizardDraft } from "../wizard-types";

const fieldClass =
  "border-admin-border bg-admin-card text-night-text focus:border-admin-primary focus:ring-admin-primary/20";
const checkboxClass = "h-4 w-4 rounded border-admin-border bg-admin-card accent-admin-primary";

// "Способ доступа" (2026-09-16, Ticket Engine v2) — чисто UI-подсказка (см.
// комментарий у Event.ticketingMode в schema.prisma): определяет, какой
// раздел вкладки "Билеты и Pass" показать по умолчанию после публикации.
// Ничего не блокирует — организатор технически может завести и TicketType,
// и Pass независимо от выбора здесь.
//
// Редизайн (2026-09-16, по прямому запросу пользователя) — раньше это был
// голый список нативных radio; теперь карточки-кнопки, тот же визуальный
// язык, что и у EventTypeSelector (иконка в квадрате + жирный заголовок +
// приглушённая подсказка + выделение primary-рамкой при выборе), чтобы
// весь мастер использовал один и тот же паттерн "выбор одного из вариантов".
const TICKETING_MODE_OPTIONS: { value: WizardDraft["ticketingMode"]; label: string; hint: string; icon: string }[] = [
  { value: "FREE", label: "Бесплатное событие", hint: "Без продажи билетов.", icon: "🆓" },
  { value: "TICKETS", label: "Продажа билетов", hint: "Простые билеты на это событие (Teacher/Dancer/…).", icon: "🎫" },
  { value: "PASSES", label: "Продажа Pass", hint: "Доступ к нескольким пунктам программы (фестиваль/интенсив).", icon: "🏷️" },
  { value: "TICKETS_AND_PASSES", label: "Билеты + Pass", hint: "И то, и другое одновременно.", icon: "🎟️" },
];

// STEP "Tickets / registration" — общий для PARTY (Early Bird/Regular/At
// Door) и MASTERCLASS (Solo/Couple/Masterclass+Party), задача явно просит не
// дублировать эту структуру под каждый тип.
export function StepTickets({ draft, onChange }: { draft: WizardDraft; onChange: (patch: Partial<WizardDraft>) => void }) {
  const showTicketsHint = draft.ticketingMode === "TICKETS" || draft.ticketingMode === "TICKETS_AND_PASSES";
  const showPassesHint = draft.ticketingMode === "PASSES" || draft.ticketingMode === "TICKETS_AND_PASSES";

  return (
    <div className="flex w-full flex-col gap-3.5">
      <h2 className="m-0 font-night text-lg font-bold text-night-text">Билеты и регистрация</h2>

      <div className="rounded-app-sm border border-admin-border p-3.5">
        <p className="m-0 mb-3 text-[10.5px] font-semibold uppercase tracking-wide text-admin-muted">Способ доступа</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {TICKETING_MODE_OPTIONS.map((opt) => {
            const selected = draft.ticketingMode === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onChange({ ticketingMode: opt.value })}
                aria-pressed={selected}
                className={cn(
                  "flex items-start gap-2.5 rounded-app-sm border p-3 text-left transition duration-150 ease-out",
                  selected
                    ? "border-admin-primary bg-admin-primary/10 shadow-[0_0_0_1px_theme(colors.admin.primary)]"
                    : "border-admin-border bg-admin-card2 hover:border-admin-primary/60"
                )}
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-admin-border bg-admin-card text-lg"
                  aria-hidden="true"
                >
                  {opt.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-bold text-night-text">{opt.label}</span>
                  <span className="block text-[11.5px] text-admin-muted">{opt.hint}</span>
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-1 h-4 w-4 shrink-0 rounded-full border-2",
                    selected ? "border-admin-primary bg-admin-primary" : "border-admin-disabled"
                  )}
                />
              </button>
            );
          })}
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

      <div className="grid gap-3.5 sm:grid-cols-2">
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
    </div>
  );
}
