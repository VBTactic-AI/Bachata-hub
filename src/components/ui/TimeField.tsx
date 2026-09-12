"use client";

import { useEffect, useRef, useState } from "react";
import type { CalendarTheme } from "./CalendarGrid";
import { ClockIcon } from "@/components/Icon";
import { cn } from "@/lib/cn";

const THEME: Record<CalendarTheme, { text: string; muted: string; border: string; card: string; hover: string; selectedBg: string }> = {
  night: {
    text: "text-night-text",
    muted: "text-night-muted",
    border: "border-night-border",
    card: "bg-night-card2",
    hover: "hover:bg-night-card",
    selectedBg: "bg-gradient-night-cta",
  },
  admin: {
    text: "text-night-text",
    muted: "text-admin-muted",
    border: "border-admin-border",
    card: "bg-admin-card2",
    hover: "hover:bg-admin-card",
    selectedBg: "bg-gradient-admin-cta",
  },
};

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));
const BASE_TRIGGER_CLASS =
  "flex w-full items-center justify-between gap-2 rounded-app-sm border px-3 py-2.5 font-body text-base transition duration-150 ease-out focus:outline-none focus:ring-[3px]";

function TimeColumn({
  values,
  selected,
  onSelect,
  c,
}: {
  values: string[];
  selected: string | null;
  onSelect: (v: string) => void;
  c: (typeof THEME)["night"];
}) {
  const selectedRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "center" });
  }, []);

  return (
    <div className="flex max-h-[180px] w-14 flex-col gap-0.5 overflow-y-auto">
      {values.map((v) => {
        const isSelected = v === selected;
        return (
          <button
            key={v}
            ref={isSelected ? selectedRef : undefined}
            type="button"
            onClick={() => onSelect(v)}
            className={cn(
              "shrink-0 rounded-app-sm py-1.5 text-center text-sm font-medium tabular-nums transition-colors",
              c.text,
              c.hover,
              isSelected && `${c.selectedBg} font-bold text-white hover:brightness-110`
            )}
          >
            {v}
          </button>
        );
      })}
    </div>
  );
}

// Кастомный выбор времени вместо нативного `<input type="time">` (2026-09-12,
// по прямому запросу пользователя — "как для дат, теперь для времени"). Тот
// же паттерн триггер-кнопка + всплывающая панель, что и DateField, тот же
// набор тем night/admin (CalendarGrid.tsx). value/onChange — строка "HH:mm",
// та же, что уже принимал `<input type="time">` — вызывающий код
// (DateTimeField) не меняется, только внутренняя реализация поля времени.
export function TimeField({
  value,
  onChange,
  theme = "night",
  required,
  className,
  placeholder = "Время",
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  theme?: CalendarTheme;
  required?: boolean;
  className?: string;
  placeholder?: string;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const c = THEME[theme];
  const [hour, minute] = value ? value.split(":") : [null, null];

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function selectHour(h: string) {
    onChange(`${h}:${minute ?? "00"}`);
  }
  function selectMinute(m: string) {
    onChange(`${hour ?? "00"}:${m}`);
  }

  return (
    <div className="relative" ref={wrapRef}>
      <button
        id={id}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(BASE_TRIGGER_CLASS, className)}
      >
        <span className={cn("tabular-nums", value ? "" : "opacity-60")}>{value || placeholder}</span>
        <ClockIcon size={16} />
      </button>

      {/* Реальный required-контрол для валидации формы — визуально скрыт, как
          и в DateField. */}
      {required && (
        <input
          tabIndex={-1}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-0 w-0 opacity-0"
          required
          value={value}
          onChange={() => {}}
        />
      )}

      {open && (
        <div
          className={cn("absolute left-0 top-full z-30 mt-1.5 flex gap-1.5 rounded-app border p-2 shadow-2xl", c.border, c.card)}
        >
          <TimeColumn values={HOURS} selected={hour} onSelect={selectHour} c={c} />
          <div className={cn("self-center pb-0.5 text-sm font-bold", c.muted)}>:</div>
          <TimeColumn values={MINUTES} selected={minute} onSelect={selectMinute} c={c} />
        </div>
      )}
    </div>
  );
}
