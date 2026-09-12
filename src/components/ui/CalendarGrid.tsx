"use client";

import { useState } from "react";
import { t } from "@/lib/i18n/dictionary";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/Icon";
import { cn } from "@/lib/cn";

export type CalendarTheme = "night" | "admin";

// Токены обеих тёмных палитр проекта (CLAUDE.md §64.2) — не изобретаем
// третью: night-* для /profile,/events,/compete и т.п., admin-* для форм
// внутри /admin. Один и тот же компонент, разный набор классов.
const THEME: Record<CalendarTheme, { text: string; muted: string; border: string; card: string; hover: string; selectedBg: string; todayRing: string }> = {
  night: {
    text: "text-night-text",
    muted: "text-night-muted",
    border: "border-night-border",
    card: "bg-night-card2",
    hover: "hover:bg-night-card",
    selectedBg: "bg-gradient-night-cta",
    todayRing: "ring-night-primary/70",
  },
  admin: {
    text: "text-night-text",
    muted: "text-admin-muted",
    border: "border-admin-border",
    card: "bg-admin-card2",
    hover: "hover:bg-admin-card",
    selectedBg: "bg-gradient-admin-cta",
    todayRing: "ring-admin-primary/70",
  },
};

// Календарная сетка месяца — общее ядро для DateField/DateTimeField
// (2026-09-12, по прямому запросу пользователя: "сделай нормальный
// календарик для ввода" вместо нативного `<input type=date>`). Тот же
// принцип раскладки, что и в публичном EventCalendar.tsx на главной —
// сетка Пн–Вс, точка "сегодня", подсветка выбранного дня, — но без точек
// событий: здесь календарь только выбирает одну дату, данных о событиях нет.
export function CalendarGrid({
  selected,
  onSelect,
  theme = "night",
}: {
  selected: Date | null;
  onSelect: (date: Date) => void;
  theme?: CalendarTheme;
}) {
  const c = THEME[theme];
  const today = new Date();
  const [viewYear, setViewYear] = useState(selected?.getFullYear() ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(selected?.getMonth() ?? today.getMonth());

  const firstDayIndex = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;
  const lastDay = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: Array<number | null> = [...Array.from({ length: firstDayIndex }, () => null), ...Array.from({ length: lastDay }, (_, i) => i + 1)];

  function prevMonth() {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  }
  function nextMonth() {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  }

  return (
    <div className={cn("w-[264px] rounded-app border p-3 shadow-2xl", c.border, c.card)}>
      <div className="mb-2 flex items-center justify-between">
        <button type="button" onClick={prevMonth} aria-label={t.calendar.prevMonth} className={cn("rounded-app-sm p-1.5 transition-colors", c.text, c.hover)}>
          <ChevronLeftIcon size={14} />
        </button>
        <span className={cn("text-sm font-bold", c.text)}>
          {t.calendar.months[viewMonth]} {viewYear}
        </span>
        <button type="button" onClick={nextMonth} aria-label={t.calendar.nextMonth} className={cn("rounded-app-sm p-1.5 transition-colors", c.text, c.hover)}>
          <ChevronRightIcon size={14} />
        </button>
      </div>

      <div className={cn("mb-1 grid grid-cols-7 text-center text-[10px] font-bold uppercase tracking-wide", c.muted)}>
        {t.calendar.weekdays.map((w) => (
          <div key={w}>{w}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (day === null) return <div key={`empty-${i}`} aria-hidden="true" />;
          const isSelected = !!selected && selected.getFullYear() === viewYear && selected.getMonth() === viewMonth && selected.getDate() === day;
          const isToday = today.getFullYear() === viewYear && today.getMonth() === viewMonth && today.getDate() === day;
          return (
            <button
              key={day}
              type="button"
              onClick={() => onSelect(new Date(viewYear, viewMonth, day))}
              className={cn(
                "aspect-square rounded-app-sm text-xs font-medium transition-colors",
                c.text,
                c.hover,
                isToday && !isSelected && `ring-1 ring-inset ${c.todayRing}`,
                isSelected && `${c.selectedBg} font-bold text-white hover:brightness-110`
              )}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
