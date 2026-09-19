import Link from "next/link";
import Image from "next/image";
import type { City, Event, EventPriceOption, School } from "@prisma/client";
import { t } from "@/lib/i18n/dictionary";
import { formatEventDateRange, formatRelativeDayLabel, eventDayCount, pluralizeRu } from "@/lib/format";
import { formatEventCardPrice } from "@/lib/event-price";
import { EVENT_FORMAT_COLOR } from "@/lib/event-format-colors";
import { CalendarIcon, PinIcon, TicketIcon } from "./Icon";
import { Card } from "@/components/ui/card";
import { Tag } from "@/components/ui/tag";
import { buttonVariants } from "@/components/ui/button";
import { FollowButton } from "@/components/notifications/FollowButton";
import { cn } from "@/lib/cn";

type EventWithRelations = Event & { city: City; school: School | null; priceOptions: EventPriceOption[] };

export const FORMAT_EMOJI: Record<Event["format"], string> = {
  PARTY: "🎉",
  MASTERCLASS: "🎓",
  FESTIVAL: "🎪",
  CONTEST: "🏆",
  INTENSIVE: "🔥",
  SOCIAL: "💃",
  OPEN_AIR: "🌤️",
  PRACTICE: "🕺",
  OTHER: "✨",
};

// Тёмная тема по макету JBJ Platform (06.09.2026) — карточка используется
// только на /events (список), не шарится со светлыми страницами.
export function EventCard({
  event,
  loggedIn = false,
  favoriteSubscriptionId = null,
}: {
  event: EventWithRelations;
  // Избранное (2026-09-19) — переиспользует уже существующий Notification &
  // Subscription Engine (type=EVENT), не отдельная сущность "избранное".
  // Опционально: страницы, не прокидывающие эти пропы (если появятся),
  // просто не покажут звезду — карточка не ломается без них.
  loggedIn?: boolean;
  favoriteSubscriptionId?: string | null;
}) {
  const relativeDay = formatRelativeDayLabel(event.startsAt);
  const price = formatEventCardPrice(event.priceText, event.priceOptions);
  const dayCount = eventDayCount(event.startsAt, event.endsAt);
  const formatColor = EVENT_FORMAT_COLOR[event.format];

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
        {dayCount && (
          <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-night-primary/90 px-2.5 py-1 text-[0.7rem] font-bold text-white">
            <CalendarIcon size={11} />
            {dayCount} {pluralizeRu(dayCount, ["день", "дня", "дней"])}
          </span>
        )}
        <FollowButton
          type="EVENT"
          targetId={event.id}
          loggedIn={loggedIn}
          initialSubscriptionId={favoriteSubscriptionId}
          labelFollow="Добавить в избранное"
          labelFollowing="В избранном"
          variant="icon"
          className="absolute bottom-2.5 right-2.5"
        />
      </div>

      <div className="flex flex-1 flex-col p-[18px] pt-3.5">
        <p className="m-0">
          <Tag className="bg-night-card2" style={{ color: formatColor }}>
            {t.event.formats[event.format]}
          </Tag>
          <Tag className="bg-night-card2 text-night-pink">{t.event.levels[event.level]}</Tag>
        </p>
        <h3 className="my-2 mb-1.5">
          <Link href={`/events/${event.slug}`} className="text-night-text no-underline hover:text-night-primary">
            {event.title}
          </Link>
        </h3>

        <div className="mt-1 flex items-center gap-1.5 text-[0.87rem] text-night-muted [&_svg]:shrink-0 [&_svg]:text-night-primary">
          <CalendarIcon />
          <span>{formatEventDateRange(event.startsAt, event.endsAt)}</span>
        </div>
        <div className="mb-3 mt-1 flex items-center gap-1.5 text-[0.87rem] text-night-muted [&_svg]:shrink-0 [&_svg]:text-night-primary">
          <PinIcon />
          <span>
            {event.city.nameRu}
            {event.school ? ` · ${event.school.name}` : event.organizerName ? ` · ${event.organizerName}` : ""}
          </span>
        </div>
        {price && (
          <div className="mb-3 mt-1 flex items-center gap-1.5 text-[0.87rem] text-night-pink [&_svg]:shrink-0">
            <TicketIcon />
            <span>{price}</span>
          </div>
        )}

        <div className="mt-auto flex items-center gap-1.5">
          <Link
            href={`/events/${event.slug}`}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "self-start border-night-border bg-transparent text-night-text no-underline hover:border-night-primary hover:text-night-primary"
            )}
          >
            {t.common.details} »
          </Link>
          <a
            href={`/api/public/events/${event.slug}/calendar`}
            download
            title="Добавить в календарь"
            aria-label="Добавить в календарь"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-night-border text-night-muted transition hover:border-night-primary hover:text-night-primary"
          >
            <CalendarIcon size={14} />
          </a>
        </div>
      </div>
    </Card>
  );
}
