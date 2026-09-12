"use client";

import { DateField } from "./DateField";
import { TimeField } from "./TimeField";
import type { CalendarTheme } from "./CalendarGrid";

function todayLocalDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Замена нативного `<input type="datetime-local">` (2026-09-12, по прямому
// запросу пользователя) — календарь для даты (DateField) + свой выбор времени
// (TimeField, добавлен тем же днём по повторному запросу — "как для дат,
// теперь для времени", вместо изначально оставленного нативного
// `<input type="time">"). value/onChange — та же строка "YYYY-MM-DDTHH:mm",
// что принимал datetime-local, вызывающий код (AddEventForm/
// CreateCompetitionForm) не меняется.
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
      <div className="w-[110px] shrink-0">
        <TimeField value={timePart} onChange={setTimePart} theme={theme} required={required} className={className} />
      </div>
    </div>
  );
}
