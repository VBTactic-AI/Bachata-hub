"use client";

import { DateField } from "./DateField";
import type { CalendarTheme } from "./CalendarGrid";
import { cn } from "@/lib/cn";

function todayLocalDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Замена нативного `<input type="datetime-local">` (2026-09-12, по прямому
// запросу пользователя) — календарь для даты (DateField) + отдельное поле
// времени. Время сознательно оставлено нативным `<input type="time">`:
// в отличие от календаря дат, встроенный выбор времени у браузеров выглядит
// достаточно нейтрально и одинаково во всех, кастомить его не просили.
// value/onChange — та же строка "YYYY-MM-DDTHH:mm", что принимал datetime-local,
// вызывающий код (AddEventForm/CreateCompetitionForm) не меняется.
export function DateTimeField({
  value,
  onChange,
  theme = "admin",
  required,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  theme?: CalendarTheme;
  required?: boolean;
  className?: string;
}) {
  const [datePart, timePart] = value ? value.split("T") : ["", ""];

  function setDatePart(d: string) {
    onChange(`${d}T${timePart || "00:00"}`);
  }
  function setTimePart(tm: string) {
    onChange(`${datePart || todayLocalDate()}T${tm}`);
  }

  return (
    <div className="flex gap-2">
      <div className="min-w-0 flex-1">
        <DateField value={datePart} onChange={setDatePart} theme={theme} required={required} className={className} />
      </div>
      <input
        type="time"
        required={required}
        value={timePart}
        onChange={(e) => setTimePart(e.target.value)}
        className={cn(
          "w-[110px] shrink-0 rounded-app-sm border px-3 py-2.5 font-body text-base transition duration-150 ease-out focus:outline-none focus:ring-[3px]",
          className
        )}
      />
    </div>
  );
}
