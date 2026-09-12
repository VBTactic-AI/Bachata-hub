"use client";

import { CheckCircleIcon } from "@/components/admin/icons";
import { cn } from "@/lib/cn";
import type { EventStepId } from "@/lib/events/event-type-registry";

const STEP_LABELS: Record<EventStepId, string> = {
  type: "Type",
  basic: "Basic",
  location: "Location",
  datetime: "Date & Time",
  partyDetails: "Party Details",
  sessions: "Sessions",
  details: "Details",
  tickets: "Tickets",
  preview: "Preview",
  publish: "Publish",
};

// Левая колонка макета "CREATE EVENT" из задачи — progress/navigation.
// Можно кликнуть на уже пройденный шаг, чтобы вернуться (данные не
// теряются — состояние живёт в EventWizard, не в самих шагах).
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
    <nav className="flex shrink-0 flex-col gap-0.5 border-admin-border sm:w-[180px] sm:border-r sm:pr-4">
      {steps.map((step, i) => {
        const active = i === currentIndex;
        const reachable = i <= currentIndex || doneMap[step];
        return (
          <button
            key={step}
            type="button"
            disabled={!reachable}
            onClick={() => onSelect(i)}
            className={cn(
              "flex items-center gap-2 rounded-app-sm px-2.5 py-2 text-left text-sm transition duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-40",
              active ? "bg-admin-card2 font-semibold text-night-text" : "text-admin-muted hover:bg-admin-card2/60"
            )}
          >
            <span className={cn("shrink-0", doneMap[step] ? "text-admin-primary" : "text-admin-disabled")}>
              {doneMap[step] ? <CheckCircleIcon /> : <span className="block h-3.5 w-3.5 rounded-full border border-current" />}
            </span>
            {STEP_LABELS[step]}
          </button>
        );
      })}
    </nav>
  );
}
