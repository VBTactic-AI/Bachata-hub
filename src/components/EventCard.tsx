import Link from "next/link";
import Image from "next/image";
import type { City, Event, School } from "@prisma/client";
import { t } from "@/lib/i18n/dictionary";
import { formatEventDate, formatEventTime, formatRelativeDayLabel } from "@/lib/format";
import { CalendarIcon, PinIcon } from "./Icon";
import { Card } from "@/components/ui/card";
import { Tag } from "@/components/ui/tag";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/cn";

type EventWithRelations = Event & { city: City; school: School | null };

export const FORMAT_EMOJI: Record<Event["format"], string> = {
  PARTY: "🎉",
  MASTERCLASS: "🎓",
  FESTIVAL: "🎪",
  CONTEST: "🏆",
  INTENSIVE: "🔥",
};

// Тёмная тема по макету JBJ Platform (06.09.2026) — карточка используется
// только на /events (список), не шарится со светлыми страницами.
export function EventCard({ event }: { event: EventWithRelations }) {
  const relativeDay = formatRelativeDayLabel(event.startsAt);

  return (
    <Card interactive className="flex flex-col overflow-hidden border-night-border bg-night-card p-0 hover:-translate-y-0 hover:border-night-primary/60 hover:shadow-none">
      <div className="relative flex aspect-video items-center justify-center overflow-hidden bg-gradient-night-hero text-4xl">
        {event.photoUrl ? (
          // Upload/Compression/Cache задача §10/§11 — next/image: браузер сам
          // получает подходящий по ширине вариант вместо всегда полноразмерной
          // афиши, плюс ленивая загрузка по умолчанию для карточек списка.
          <Image
            src={event.photoUrl}
            alt={event.title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 360px"
            className="object-cover"
          />
        ) : (
          <span aria-hidden="true">{FORMAT_EMOJI[event.format]}</span>
        )}
        {relativeDay && (
          <span className="absolute right-2.5 top-2.5 rounded-full bg-black/60 px-3 py-1 text-[0.72rem] font-bold uppercase tracking-wide text-white backdrop-blur-sm">
            {relativeDay}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-[18px] pt-3.5">
        <p className="m-0">
          <Tag className="bg-night-card2 text-night-pink">{t.event.formats[event.format]}</Tag>
          <Tag className="bg-night-card2 text-night-pink">{t.event.levels[event.level]}</Tag>
        </p>
        <h3 className="my-2 mb-1.5">
          <Link href={`/events/${event.slug}`} className="text-night-text no-underline hover:text-night-primary">
            {event.title}
          </Link>
        </h3>

        <div className="mt-1 flex items-center gap-1.5 text-[0.87rem] text-night-muted [&_svg]:shrink-0 [&_svg]:text-night-primary">
          <CalendarIcon />
          <span>
            {formatEventDate(event.startsAt)}, {formatEventTime(event.startsAt)}
          </span>
        </div>
        <div className="mb-3 mt-1 flex items-center gap-1.5 text-[0.87rem] text-night-muted [&_svg]:shrink-0 [&_svg]:text-night-primary">
          <PinIcon />
          <span>
            {event.city.nameRu}
            {event.school ? ` · ${event.school.name}` : event.organizerName ? ` · ${event.organizerName}` : ""}
          </span>
        </div>

        <Link
          href={`/events/${event.slug}`}
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "mt-auto self-start border-night-border bg-transparent text-night-text no-underline hover:border-night-primary hover:text-night-primary"
          )}
        >
          {t.common.details} »
        </Link>
      </div>
    </Card>
  );
}
