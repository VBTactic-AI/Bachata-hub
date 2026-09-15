"use client";

import { useState } from "react";
import type { EventFormat } from "@prisma/client";
import { ALL_EVENT_FORMATS, EVENT_TYPE_REGISTRY, FEATURED_EVENT_FORMATS } from "@/lib/events/event-type-registry";
import { cn } from "@/lib/cn";

// Выбор типа события (редизайн 2026-09-16, по прямому запросу пользователя,
// макет согласован заранее) — раньше был отдельным полноэкранным шагом
// ("type"), теперь живёт постоянной левой колонкой рядом с формой "Тип и
// основное" (см. EventWizard.tsx), можно сменить в любой момент без ухода
// со страницы. Два независимых представления одного и того же состояния:
// - Десктоп (>= sm) — вертикальный список карточек (3 главных формата) +
//   разворачиваемый список остальных чипами.
// - Мобильный (< sm) — одна горизонтально прокручиваемая лента чипов на
//   ВСЕ форматы (вертикальные карточки на телефоне съедали бы весь экран
//   ещё до формы, найдено при согласовании макета).
const OTHER_EVENT_FORMATS: EventFormat[] = ALL_EVENT_FORMATS.filter((f) => !FEATURED_EVENT_FORMATS.includes(f));

export function EventTypeSelector({
  value,
  onChange,
  canCreateCompetition,
}: {
  value: EventFormat;
  onChange: (format: EventFormat) => void;
  canCreateCompetition: boolean;
}) {
  const [otherOpen, setOtherOpen] = useState(() => OTHER_EVENT_FORMATS.includes(value));

  function isDisabled(format: EventFormat) {
    return format === "CONTEST" && !canCreateCompetition;
  }

  return (
    <div className="flex flex-col gap-3">
      {/* ---------- Мобильный вариант — горизонтальная лента ---------- */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:hidden">
        {ALL_EVENT_FORMATS.map((format) => {
          const config = EVENT_TYPE_REGISTRY[format];
          const disabled = isDisabled(format);
          const selected = value === format;
          return (
            <button
              key={format}
              type="button"
              disabled={disabled}
              onClick={() => onChange(format)}
              className={cn(
                "flex w-[74px] shrink-0 flex-col items-center gap-1.5 rounded-2xl border p-2.5 text-center transition duration-150 ease-out disabled:opacity-40",
                selected ? "border-admin-primary bg-admin-primary/10" : "border-admin-border bg-admin-card2"
              )}
            >
              <span
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-[9px] border text-base",
                  selected ? "border-admin-primary" : "border-admin-border bg-admin-card"
                )}
              >
                {config.icon}
              </span>
              <span className="text-[10px] font-semibold leading-tight text-[#cdd3e0]">{config.label}</span>
            </button>
          );
        })}
      </div>

      {/* ---------- Десктоп — вертикальные карточки ---------- */}
      <div className="hidden flex-col gap-2 sm:flex">
        {FEATURED_EVENT_FORMATS.map((format) => {
          const config = EVENT_TYPE_REGISTRY[format];
          const disabled = isDisabled(format);
          const selected = value === format;
          return (
            <button
              key={format}
              type="button"
              disabled={disabled}
              onClick={() => onChange(format)}
              className={cn(
                "flex items-center gap-2.5 rounded-app-sm border bg-admin-card2 p-3 text-left transition duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-55",
                selected ? "border-admin-primary bg-admin-primary/10 shadow-[0_0_0_1px_theme(colors.admin.primary)]" : "border-admin-border hover:border-admin-primary/60"
              )}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-admin-border bg-admin-card text-lg" aria-hidden="true">
                {config.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-bold text-night-text">{config.label}</span>
                <span className="block text-[11.5px] text-admin-muted">{config.description}</span>
                {disabled && <span className="mt-0.5 block text-[10.5px] text-red-400">Нет прав на создание соревнований</span>}
              </span>
              {!disabled && <span className={cn("shrink-0 text-lg", selected ? "text-admin-primary" : "text-admin-disabled")}>›</span>}
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setOtherOpen((o) => !o)}
          className="mt-1 self-start text-xs font-semibold text-admin-primaryHover hover:underline"
        >
          Другие форматы {otherOpen ? "▴" : "▾"}
        </button>
        {otherOpen && (
          <div className="flex flex-wrap gap-1.5">
            {OTHER_EVENT_FORMATS.map((format) => {
              const config = EVENT_TYPE_REGISTRY[format];
              const selected = value === format;
              return (
                <button
                  key={format}
                  type="button"
                  onClick={() => onChange(format)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs transition duration-150 ease-out",
                    selected
                      ? "border-admin-primary bg-admin-primary/10 text-night-text"
                      : "border-admin-border bg-admin-card2 text-admin-muted hover:border-admin-primary/60"
                  )}
                >
                  {config.icon} {config.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
