"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { EventFormat } from "@prisma/client";
import { t } from "@/lib/i18n/dictionary";
import { formatEventTime } from "@/lib/format";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/Icon";
import { EVENT_FORMAT_COLOR } from "@/lib/event-format-colors";
import { cn } from "@/lib/cn";

export type CalendarEventDto = {
  id: string;
  slug: string;
  title: string;
  format: EventFormat;
  startsAt: string; // ISO
  cityName: string;
  schoolName: string | null;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function dateKey(y: number, m: number, d: number) {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

function dateKeyFromDate(date: Date) {
  return dateKey(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

type Props = {
  initialYear: number;
  initialMonth: number; // 1-12
  initialEvents: CalendarEventDto[];
  cityId: string | null;
};

export function EventCalendar({ initialYear, initialMonth, initialEvents, cityId }: Props) {
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [events, setEvents] = useState(initialEvents);
  const [selectedDate, setSelectedDate] = useState<string | null>(() => {
    const now = new Date();
    const todayKey = dateKeyFromDate(now);
    return todayKey.startsWith(`${initialYear}-${pad2(initialMonth)}`) ? todayKey : null;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEventDto[]>();
    for (const ev of events) {
      const key = dateKeyFromDate(new Date(ev.startsAt));
      const list = map.get(key) ?? [];
      list.push(ev);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    }
    return map;
  }, [events]);

  async function goToMonth(targetYear: number, targetMonth: number) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ year: String(targetYear), month: String(targetMonth) });
      if (cityId) params.set("city", cityId);
      const res = await fetch(`/api/public/events/calendar?${params.toString()}`);
      if (!res.ok) throw new Error("bad status");
      const data: { events: CalendarEventDto[] } = await res.json();
      setYear(targetYear);
      setMonth(targetMonth);
      setEvents(data.events);
      const now = new Date();
      const todayKey = dateKeyFromDate(now);
      setSelectedDate(todayKey.startsWith(`${targetYear}-${pad2(targetMonth)}`) ? todayKey : null);
    } catch {
      setError(t.common.errorGeneric);
    } finally {
      setLoading(false);
    }
  }

  function handlePrev() {
    const targetMonth = month === 1 ? 12 : month - 1;
    const targetYear = month === 1 ? year - 1 : year;
    void goToMonth(targetYear, targetMonth);
  }

  function handleNext() {
    const targetMonth = month === 12 ? 1 : month + 1;
    const targetYear = month === 12 ? year + 1 : year;
    void goToMonth(targetYear, targetMonth);
  }

  const firstDayIndex = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const lastDay = new Date(year, month, 0).getDate();
  const now = new Date();
  const todayKey = dateKeyFromDate(now);

  const cells: Array<number | null> = [
    ...Array.from({ length: firstDayIndex }, () => null),
    ...Array.from({ length: lastDay }, (_, i) => i + 1),
  ];

  const selectedEvents = selectedDate ? (eventsByDate.get(selectedDate) ?? []) : null;

  return (
    <div className="flex flex-col gap-5 rounded-app border border-white/10 bg-night-card/75 p-4 backdrop-blur-md sm:flex-row sm:gap-6 sm:p-6">
      <div className="flex-1">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="m-0 font-night text-base font-bold text-night-text sm:text-lg">
            {t.calendar.months[month - 1]} {year}
          </h3>
          <div className="flex gap-1.5">
            <button
              type="button"
              aria-label={t.calendar.prevMonth}
              onClick={handlePrev}
              disabled={loading}
              className="rounded-app-sm bg-white/5 p-2 text-night-text transition-colors hover:bg-night-primary disabled:opacity-40"
            >
              <ChevronLeftIcon />
            </button>
            <button
              type="button"
              aria-label={t.calendar.nextMonth}
              onClick={handleNext}
              disabled={loading}
              className="rounded-app-sm bg-white/5 p-2 text-night-text transition-colors hover:bg-night-primary disabled:opacity-40"
            >
              <ChevronRightIcon />
            </button>
          </div>
        </div>

        <div className="mb-2 grid grid-cols-7 text-center text-xs font-semibold text-night-muted">
          {t.calendar.weekdays.map((w) => (
            <div key={w}>{w}</div>
          ))}
        </div>

        <div className={cn("grid grid-cols-7 gap-1.5 transition-opacity sm:gap-2", loading && "pointer-events-none opacity-50")}>
          {cells.map((day, i) => {
            if (day === null) return <div key={`empty-${i}`} aria-hidden="true" />;

            const key = dateKey(year, month, day);
            const dayEvents = eventsByDate.get(key) ?? [];
            const isToday = key === todayKey;
            const isSelected = key === selectedDate;

            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedDate(key)}
                className={cn(
                  "relative flex aspect-square flex-col items-center justify-center gap-1 rounded-app-sm text-sm text-night-text transition-colors hover:bg-white/10",
                  isToday && !isSelected && "ring-1 ring-inset ring-night-primary/70",
                  isSelected && "bg-gradient-night-cta font-bold text-white hover:brightness-110"
                )}
              >
                <span>{day}</span>
                {dayEvents.length > 0 && (
                  <span className="flex gap-0.5">
                    {dayEvents.slice(0, 4).map((ev) => (
                      <span
                        key={ev.id}
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: EVENT_FORMAT_COLOR[ev.format] }}
                        aria-hidden="true"
                      />
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1.5 border-t border-white/10 pt-3">
          {(Object.keys(EVENT_FORMAT_COLOR) as EventFormat[]).map((format) => (
            <span key={format} className="flex items-center gap-1.5 text-[0.7rem] text-night-muted">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: EVENT_FORMAT_COLOR[format] }} aria-hidden="true" />
              {t.event.formats[format]}
            </span>
          ))}
        </div>

        {error && <p className="m-0 mt-3 text-xs text-night-danger">{error}</p>}
      </div>

      <div className="flex w-full flex-col gap-2 sm:w-[260px] sm:shrink-0">
        <h4 className="m-0 border-b border-white/10 pb-2 text-sm font-semibold text-night-muted">{t.nav.calendar}</h4>
        <div className="flex flex-col gap-2 sm:max-h-[340px] sm:overflow-y-auto">
          {!selectedDate && <p className="m-0 text-sm text-night-muted">{t.calendar.selectDayHint}</p>}
          {selectedDate && selectedEvents && selectedEvents.length === 0 && (
            <p className="m-0 text-sm italic text-night-muted">{t.calendar.noEventsOnDay}</p>
          )}
          {selectedEvents?.map((ev) => (
            <Link
              key={ev.id}
              href={`/events/${ev.slug}`}
              className="flex flex-col gap-0.5 rounded-app-sm border-l-4 bg-white/5 px-3 py-2 no-underline transition-colors hover:bg-white/10"
              style={{ borderLeftColor: EVENT_FORMAT_COLOR[ev.format] }}
            >
              <span className="text-xs font-medium text-night-muted">{formatEventTime(new Date(ev.startsAt))}</span>
              <span className="truncate text-sm font-semibold text-night-text">{ev.title}</span>
              <span className="truncate text-xs text-night-muted">
                {[ev.cityName, ev.schoolName].filter(Boolean).join(" · ")}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
