"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarGrid, type CalendarTheme } from "./CalendarGrid";
import { CalendarIcon } from "@/components/Icon";
import { cn } from "@/lib/cn";

// "YYYY-MM-DD" -> Date в ЛОКАЛЬНОЙ таймзоне (не new Date(string), который
// Chrome/Node парсят как UTC-полночь — на отрицательных смещениях от UTC
// это сдвигает отображаемый день назад на сутки). Тот же принцип, что уже
// применялся в EventCalendar.tsx.
function parseLocalDate(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function formatLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const displayFormatter = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });

const BASE_TRIGGER_CLASS =
  "flex w-full items-center justify-between gap-2 rounded-app-sm border px-3 py-2.5 font-body text-base transition duration-150 ease-out focus:outline-none focus:ring-[3px]";

// Кастомный календарь вместо нативного `<input type="date">` (2026-09-12, по
// прямому запросу пользователя — "сделай нормальный календарик для ввода"):
// нативный контрол на разных браузерах/ОС выглядит по-разному и не поддаётся
// стилизации под тёмную тему проекта. Управляемый компонент — value/onChange
// те же ISO-строки "YYYY-MM-DD", что уже принимали существующие поля, так
// что замена не требует правок в вызывающей логике сохранения.
export function DateField({
  value,
  onChange,
  theme = "night",
  required,
  className,
  placeholder = "Выберите дату",
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
  const selected = parseLocalDate(value);

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
        <span className={selected ? "" : "opacity-60"}>{selected ? displayFormatter.format(selected) : placeholder}</span>
        <CalendarIcon size={16} />
      </button>

      {/* Реальный required-контрол для валидации формы (пустая строка —
          невалидно) — визуально скрыт, кнопка выше отвечает за отображение и
          открытие календаря. */}
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
        <div className="absolute left-0 top-full z-30 mt-1.5">
          <CalendarGrid
            selected={selected}
            theme={theme}
            onSelect={(d) => {
              onChange(formatLocalDate(d));
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
