"use client";

import type { EventFormat } from "@prisma/client";
import { EVENT_TYPE_REGISTRY, FEATURED_EVENT_FORMATS } from "@/lib/events/event-type-registry";
import { cn } from "@/lib/cn";

// STEP 1 — большие карточки выбора типа события (задача "Select event type").
// Три первых типа — карточки; остальные значения EventFormat (Festival/
// Intensive) доступны отдельным списком под ними, без потери существующей
// возможности их создать, но не как главный путь.
export function StepType({
  value,
  onChange,
  canCreateCompetition,
}: {
  value: EventFormat;
  onChange: (format: EventFormat) => void;
  canCreateCompetition: boolean;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="m-0 font-night text-lg font-bold text-night-text">Select event type</h2>
        <p className="m-0 mt-1 text-sm text-admin-muted">Выберите тип события — дальше мастер покажет только нужные шаги.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {FEATURED_EVENT_FORMATS.map((format) => {
          const config = EVENT_TYPE_REGISTRY[format];
          const disabled = format === "CONTEST" && !canCreateCompetition;
          const selected = value === format;
          return (
            <button
              key={format}
              type="button"
              disabled={disabled}
              onClick={() => onChange(format)}
              className={cn(
                "flex flex-col items-start gap-2 rounded-app border bg-admin-card p-5 text-left transition duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-40",
                selected
                  ? "border-admin-primary shadow-[0_0_0_1px_theme(colors.admin.primary),0_0_24px_-6px_theme(colors.admin.primary)]"
                  : "border-admin-border hover:border-admin-primary/60"
              )}
            >
              <span className="text-3xl" aria-hidden="true">
                {config.icon}
              </span>
              <span className="font-night text-base font-bold uppercase tracking-wide text-night-text">{config.label}</span>
              <span className="text-sm text-admin-muted">{config.description}</span>
              {disabled && <span className="text-xs text-red-400">Нет прав на создание соревнований</span>}
            </button>
          );
        })}
      </div>

      <details className="text-sm text-admin-muted">
        <summary className="cursor-pointer select-none text-admin-muted hover:text-night-text">Другие форматы</summary>
        <div className="mt-2 flex flex-wrap gap-2">
          {(["FESTIVAL", "INTENSIVE"] as EventFormat[]).map((format) => {
            const config = EVENT_TYPE_REGISTRY[format];
            const selected = value === format;
            return (
              <button
                key={format}
                type="button"
                onClick={() => onChange(format)}
                className={cn(
                  "rounded-full border px-4 py-2 text-sm transition duration-150 ease-out",
                  selected
                    ? "border-admin-primary bg-admin-primary/10 text-night-text"
                    : "border-admin-border bg-admin-card text-admin-muted hover:border-admin-primary/60"
                )}
              >
                {config.icon} {config.label}
              </button>
            );
          })}
        </div>
      </details>
    </div>
  );
}
