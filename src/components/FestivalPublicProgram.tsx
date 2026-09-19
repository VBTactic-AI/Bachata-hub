"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

const PROGRAM_ITEM_TYPE_LABELS: Record<string, string> = {
  WORKSHOP: "Мастер-класс",
  PARTY: "Вечеринка",
  COMPETITION: "Конкурс",
  OTHER: "Другое",
};

export type PublicProgramItem = {
  id: string;
  title: string;
  type: string;
  timeLabel: string;
  teacherName: string | null;
  capacity: number | null;
  showCapacityPublicly: boolean;
  linkedEventSlug: string | null;
};

// День-стрип фильтр + выделение конкурсов/шоу отдельной "feature"-карточкой
// (перенос UI-прототипа Festival Engine, Stage R9, 2026-09-19) — клиентский
// компонент только ради переключения выбранного дня, сами данные программы
// по-прежнему приходят с сервера (FestivalPage), ничего не досчитывается на
// клиенте.
export function FestivalPublicProgram({ days }: { days: [string, PublicProgramItem[]][] }) {
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const visibleDays = selectedDay ? days.filter(([day]) => day === selectedDay) : days;

  return (
    <div className="flex flex-col gap-5">
      {days.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setSelectedDay(null)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-bold",
              selectedDay === null ? "border-night-primary bg-night-primary text-white" : "border-night-border text-night-muted hover:text-night-text"
            )}
          >
            Все дни
          </button>
          {days.map(([day]) => (
            <button
              key={day}
              type="button"
              onClick={() => setSelectedDay(day)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-bold",
                selectedDay === day ? "border-night-primary bg-night-primary text-white" : "border-night-border text-night-muted hover:text-night-text"
              )}
            >
              {day}
            </button>
          ))}
        </div>
      )}

      {visibleDays.map(([day, items]) => (
        <div key={day}>
          <p className="m-0 mb-2 text-xs font-bold uppercase tracking-wide text-night-muted">{day}</p>
          <div className="flex flex-col gap-2">
            {items.map((item) => {
              const meta = [
                item.timeLabel,
                item.teacherName,
                item.capacity != null && item.showCapacityPublicly ? `до ${item.capacity} чел.` : null,
              ]
                .filter(Boolean)
                .join(" · ");

              // Feature-карточка для конкурса/шоу — крупнее и с акцентным
              // тегом, по образцу UI-прототипа (без выдуманного текста
              // описания — ProgramItem его не хранит, показываем только то,
              // что реально есть).
              if (item.type === "COMPETITION") {
                const body = (
                  <div className="rounded-app border border-night-border bg-night-card p-4">
                    <span className="mb-1.5 inline-block w-fit rounded-full bg-night-warning/15 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-night-warning">
                      Конкурс
                    </span>
                    <p className="m-0 text-base font-bold text-night-text">{item.title}</p>
                    <p className="m-0 mt-1 text-xs text-night-muted">{meta}</p>
                  </div>
                );
                return (
                  <div key={item.id}>
                    {item.linkedEventSlug ? (
                      <a href={`/events/${item.linkedEventSlug}`} className="block no-underline hover:no-underline">
                        {body}
                      </a>
                    ) : (
                      body
                    )}
                  </div>
                );
              }

              const body = (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <p className="m-0 text-sm font-semibold text-night-text">{item.title}</p>
                    <span className="shrink-0 rounded-full bg-night-card2 px-2.5 py-1 text-xs font-semibold text-night-pink">
                      {PROGRAM_ITEM_TYPE_LABELS[item.type] ?? item.type}
                    </span>
                  </div>
                  <p className="m-0 mt-0.5 text-xs text-night-muted">{meta}</p>
                </>
              );
              return (
                <div key={item.id} className="rounded-app-sm border border-night-border bg-night-card px-3.5 py-3">
                  {item.linkedEventSlug ? (
                    <a href={`/events/${item.linkedEventSlug}`} className="block no-underline hover:no-underline">
                      {body}
                    </a>
                  ) : (
                    body
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
