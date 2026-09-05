import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { t } from "@/lib/i18n/dictionary";
import { formatDateTime } from "@/lib/format";
import { AttendanceButtons } from "@/components/AttendanceButtons";
import { ShareButtons } from "@/components/ShareButtons";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tag } from "@/components/ui/tag";

async function getEvent(slug: string) {
  return prisma.event.findUnique({
    where: { slug },
    include: { city: true, school: true },
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const event = await getEvent(slug);
  if (!event) return {};
  return {
    title: event.title,
    description: event.description?.slice(0, 160) ?? `${t.event.formats[event.format]} в ${event.city.nameRu}`,
    openGraph: {
      title: event.title,
      description: event.description ?? undefined,
      images: event.photoUrl ? [event.photoUrl] : undefined,
    },
  };
}

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await getEvent(slug);
  if (!event || (event.moderationStatus !== "APPROVED")) notFound();

  const user = await getCurrentUser();
  const attendance = user
    ? await prisma.dancer
        .findUnique({ where: { userId: user.id } })
        .then((dancer) =>
          dancer
            ? prisma.attendance.findUnique({
                where: { dancerId_eventId: { dancerId: dancer.id, eventId: event.id } },
              })
            : null
        )
    : null;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const pageUrl = `${siteUrl}/events/${event.slug}`;

  // structured data — Event (schema.org), см. модуль "Рост и обнаружение"
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    startDate: event.startsAt.toISOString(),
    endDate: event.endsAt?.toISOString(),
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    eventStatus: "https://schema.org/EventScheduled",
    location: {
      "@type": "Place",
      name: event.venueName,
      address: event.venueAddress || event.city.nameRu,
    },
    image: event.photoUrl ? [event.photoUrl] : undefined,
    description: event.description ?? undefined,
    organizer: event.school
      ? { "@type": "Organization", name: event.school.name }
      : event.organizerName
        ? { "@type": "Person", name: event.organizerName }
        : undefined,
    offers: event.externalLinkUrl
      ? { "@type": "Offer", url: event.externalLinkUrl, price: undefined, priceCurrency: "BYN" }
      : undefined,
  };

  const isPast = event.startsAt < new Date();

  return (
    <article className="flex flex-col gap-4">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {event.photoUrl && <img src={event.photoUrl} alt={event.title} className="rounded-app" />}

      <div>
        <p className="m-0 text-sm text-night-muted">
          {formatDateTime(event.startsAt)} · {event.city.nameRu}
        </p>
        <h1 className="m-0 mt-1 font-night text-2xl font-extrabold text-night-text">{event.title}</h1>
        <div className="mt-2">
          <Tag className="bg-night-card2 text-night-pink">{t.event.formats[event.format]}</Tag>
          <Tag className="bg-night-card2 text-night-pink">{t.event.levels[event.level]}</Tag>
          {isPast && (
            <Badge variant="community" className="bg-night-card2 text-night-muted">
              {t.event.pastEvent}
            </Badge>
          )}
        </div>
      </div>

      <Card className="flex flex-col gap-2 border-night-border bg-night-card">
        <p className="m-0 text-sm text-night-text">
          <strong>{t.event.place}:</strong> <span className="text-night-muted">{event.venueName}</span>
          {event.venueAddress ? <span className="text-night-muted">{`, ${event.venueAddress}`}</span> : ""}
        </p>
        <p className="m-0 text-sm text-night-text">
          <strong>{t.event.organizer}:</strong>{" "}
          {event.school ? (
            <a href={`/schools/${event.school.slug}`} className="text-night-primary">
              {event.school.name}
            </a>
          ) : (
            <span className="text-night-muted">{event.organizerName || "—"}</span>
          )}
        </p>
        {event.priceText && (
          <p className="m-0 text-sm text-night-text">
            <strong>{t.event.price}:</strong> <span className="text-night-muted">{event.priceText}</span>
          </p>
        )}
        {event.externalLinkUrl && (
          <p className="m-0 text-sm">
            <a href={event.externalLinkUrl} target="_blank" rel="noopener noreferrer" className="text-night-primary">
              {t.event.registerExternal} →
            </a>
          </p>
        )}
      </Card>

      {event.description && (
        <div>
          <h2 className="m-0 mb-2 font-night text-base font-bold text-night-text">{t.event.description}</h2>
          <p className="m-0 whitespace-pre-wrap text-sm leading-relaxed text-night-muted">{event.description}</p>
        </div>
      )}

      {event.tags.length > 0 && (
        <div>
          {event.tags.map((tag) => (
            <Tag key={tag} className="bg-night-card2 text-night-pink">
              #{tag}
            </Tag>
          ))}
        </div>
      )}

      <AttendanceButtons
        eventSlug={event.slug}
        initialStatus={attendance?.status ?? null}
        loggedIn={!!user}
      />

      <ShareButtons url={pageUrl} title={event.title} />
    </article>
  );
}
