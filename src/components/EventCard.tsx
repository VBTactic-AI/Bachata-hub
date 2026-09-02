import Link from "next/link";
import type { City, Event, School } from "@prisma/client";
import { t } from "@/lib/i18n/dictionary";
import { formatDateTime } from "@/lib/format";

type EventWithRelations = Event & { city: City; school: School | null };

export function EventCard({ event }: { event: EventWithRelations }) {
  return (
    <article className="card card--interactive">
      <p className="hint-text" style={{ margin: 0 }}>
        {formatDateTime(event.startsAt)} · {event.city.nameRu}
      </p>
      <h3 style={{ margin: "6px 0" }}>
        <Link href={`/events/${event.slug}`}>{event.title}</Link>
      </h3>
      <p style={{ margin: "0 0 8px" }}>
        <span className="tag">{t.event.formats[event.format]}</span>
        <span className="tag">{t.event.levels[event.level]}</span>
      </p>
      <p className="hint-text" style={{ margin: 0 }}>
        {event.venueName}
        {event.school ? ` · ${event.school.name}` : event.organizerName ? ` · ${event.organizerName}` : ""}
      </p>
    </article>
  );
}
