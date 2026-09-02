import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { t } from "@/lib/i18n/dictionary";
import { formatDateTime } from "@/lib/format";
import { AttendanceButtons } from "@/components/AttendanceButtons";
import { ShareButtons } from "@/components/ShareButtons";

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
    <article className="stack">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {event.photoUrl && <img src={event.photoUrl} alt={event.title} style={{ borderRadius: 12 }} />}

      <div>
        <p className="hint-text" style={{ margin: 0 }}>
          {formatDateTime(event.startsAt)} · {event.city.nameRu}
        </p>
        <h1 className="page-title">{event.title}</h1>
        <div>
          <span className="tag">{t.event.formats[event.format]}</span>
          <span className="tag">{t.event.levels[event.level]}</span>
          {isPast && <span className="badge badge-community">{t.event.pastEvent}</span>}
        </div>
      </div>

      <div className="card stack" style={{ gap: 8 }}>
        <p style={{ margin: 0 }}>
          <strong>{t.event.place}:</strong> {event.venueName}
          {event.venueAddress ? `, ${event.venueAddress}` : ""}
        </p>
        <p style={{ margin: 0 }}>
          <strong>{t.event.organizer}:</strong>{" "}
          {event.school ? (
            <a href={`/schools/${event.school.slug}`}>{event.school.name}</a>
          ) : (
            event.organizerName || "—"
          )}
        </p>
        {event.priceText && (
          <p style={{ margin: 0 }}>
            <strong>{t.event.price}:</strong> {event.priceText}
          </p>
        )}
        {event.externalLinkUrl && (
          <p style={{ margin: 0 }}>
            <a href={event.externalLinkUrl} target="_blank" rel="noopener noreferrer">
              {t.event.registerExternal} →
            </a>
          </p>
        )}
      </div>

      {event.description && (
        <div>
          <h2 className="page-title">{t.event.description}</h2>
          <p style={{ whiteSpace: "pre-wrap" }}>{event.description}</p>
        </div>
      )}

      {event.tags.length > 0 && (
        <div>
          {event.tags.map((tag) => (
            <span key={tag} className="tag">
              #{tag}
            </span>
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
