"use client";

import { cn } from "@/lib/cn";
import type { EventStepId } from "@/lib/events/event-type-registry";

const STEP_LABELS: Record<EventStepId, string> = {
  basic: "Тип и основное",
  datetime: "Дата и время",
  partyDetails: "О вечеринке",
  sessions: "Занятия",
  details: "Детали",
  festivalProgram: "Программа",
  tickets: "Билеты",
  publish: "Публикация",
  recurrence: "Повторение",
};

// Горизонтальный номерной степпер (редизайн 2026-09-16, по прямому запросу
// пользователя, макет согласован заранее) — заменяет прежнюю вертикальную
// колонку-навигацию. "basic" теперь называется "Тип и основное", потому что
// внутри этого шага живёт и выбор типа события, и место проведения (см.
// комментарий у EventStepId) — раньше это были три отдельных шага.
export function WizardNav({
  steps,
  currentIndex,
  doneMap,
  onSelect,
}: {
  steps: EventStepId[];
  currentIndex: number;
  doneMap: Record<string, boolean>;
  onSelect: (index: number) => void;
}) {
  return (
    <nav className="flex items-center gap-1.5 overflow-x-auto pb-1">
      {steps.map((step, i) => {
        const active = i === currentIndex;
        const done = doneMap[step] && !active;
        const reachable = i <= currentIndex || doneMap[step];
        return (
          <div key={step} className="flex shrink-0 items-center gap-1.5">
            {i > 0 && <span className="h-px w-5 shrink-0 bg-admin-border" aria-hidden="true" />}
            <button
              type="button"
              disabled={!reachable}
              onClick={() => onSelect(i)}
              className="flex shrink-0 items-center gap-2 rounded-app-sm px-1 py-1 text-left transition duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span
                className={cn(
                  "flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border text-xs font-bold transition duration-150 ease-out",
                  active
                    ? "border-admin-primary bg-admin-primary text-white"
                    : done
                      ? "border-admin-primary bg-transparent text-admin-primary"
                      : "border-admin-border bg-admin-card text-admin-muted"
                )}
              >
                {i + 1}
              </span>
              <span className={cn("whitespace-nowrap text-sm", active ? "font-bold text-night-text" : done ? "text-[#cdd3e0]" : "text-admin-muted")}>
                {STEP_LABELS[step]}
              </span>
            </button>
          </div>
        );
      })}
    </nav>
  );
}
