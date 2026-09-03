import Link from "next/link";
import type { City, Event, School } from "@prisma/client";
import { t } from "@/lib/i18n/dictionary";
import { formatEventDate, formatEventTime, formatRelativeDayLabel } from "@/lib/format";
import { CalendarIcon, PinIcon } from "./Icon";

type EventWithRelations = Event & { city: City; school: School | null };

const FORMAT_EMOJI: Record<Event["format"], string> = {
  PARTY: "🎉",
  MASTERCLASS: "🎓",
  FESTIVAL: "🎪",
  CONTEST: "🏆",
  INTENSIVE: "🔥",
};

export function EventCard({ event }: { event: EventWithRelations }) {
  const relativeDay = formatRelativeDayLabel(event.startsAt);

  return (
    <article className="card card--interactive event-card">
      <div className="event-card-thumb" style={event.photoUrl ? { backgroundImage: `url(${event.photoUrl})` } : undefined}>
        {!event.photoUrl && <span aria-hidden="true">{FORMAT_EMOJI[event.format]}</span>}
        {relativeDay && <span className="ribbon">{relativeDay}</span>}
      </div>

      <div className="event-card-body">
        <p style={{ margin: 0 }}>
          <span className="tag">{t.event.formats[event.format]}</span>
          <span className="tag">{t.event.levels[event.level]}</span>
        </p>
        <h3 style={{ margin: "8px 0 6px" }}>
          <Link href={`/events/${event.slug}`}>{event.title}</Link>
        </h3>

        <div className="meta-row">
          <CalendarIcon />
          <span>
            {formatEventDate(event.startsAt)}, {formatEventTime(event.startsAt)}
          </span>
        </div>
        <div className="meta-row">
          <PinIcon />
          <span>
            {event.city.nameRu}
            {event.school ? ` · ${event.school.name}` : event.organizerName ? ` · ${event.organizerName}` : ""}
          </span>
        </div>

        <Link href={`/events/${event.slug}`} className="btn btn-sm btn-outline event-card-cta">
          {t.common.details} »
        </Link>
      </div>
    </article>
  );
}
