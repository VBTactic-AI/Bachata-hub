import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { t } from "@/lib/i18n/dictionary";
import { formatDateTime } from "@/lib/format";
import { AttendanceButtons } from "@/components/AttendanceButtons";
import { ShareButtons } from "@/components/ShareButtons";
import { PublicEventGallery } from "@/components/PublicEventGallery";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tag } from "@/components/ui/tag";

async function getEvent(slug: string) {
  return prisma.event.findUnique({
    where: { slug },
    include: {
      city: true,
      school: true,
      // isMain: "desc" первой — главная афиша всегда идёт первой в галерее,
      // даже если её sortOrder не 0 (задача §13 — главная и порядок независимы).
      media: { orderBy: [{ isMain: "desc" }, { sortOrder: "asc" }] },
      // По запросу пользователя (2026-09-13) — карточка события должна
      // показывать ВСЕ заполненные в мастере поля, не только базовые.
      priceOptions: { orderBy: { order: "asc" } },
      partyDetails: true,
      masterclassDetails: { include: { sessions: { include: { teacher: true }, orderBy: { order: "asc" } } } },
    },
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
      images: event.media.length > 0 ? event.media.map((m) => m.url) : event.photoUrl ? [event.photoUrl] : undefined,
    },
  };
}

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await getEvent(slug);
  const user = await getCurrentUser();
  // Event Engine — превью черновика мастера: автор/ADMIN видит свою карточку
  // ровно тем же рендерером, что и публичные посетители (задача "Preview" —
  // "Admin Event Editor -> Event data -> Public Event Renderer", не отдельный
  // примитивный предпросмотр), до публикации/прохождения модерации. Все
  // остальные — только опубликованное и одобренное, как и раньше.
  const isOwnerOrAdmin = !!user && (user.id === event?.createdById || user.role === "ADMIN");
  if (!event || (!(event.status === "PUBLISHED" && event.moderationStatus === "APPROVED") && !isOwnerOrAdmin)) {
    notFound();
  }
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
    image: event.media.length > 0 ? event.media.map((m) => m.url) : event.photoUrl ? [event.photoUrl] : undefined,
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

  // Не показывать заголовок раздела, если реально нечего показать под ним —
  // PartyDetails/MasterclassDetails создаются при каждом сохранении черновика
  // этого формата (event-service.ts), даже если организатор ничего в шаге не
  // заполнил (найдено вживую, 2026-09-13: пустой блок "О вечеринке" на
  // реальной опубликованной карточке).
  const pd = event.partyDetails;
  const hasPartyContent =
    !!pd &&
    (pd.musicStyles.length > 0 ||
      pd.djs.length > 0 ||
      pd.danceFloors.length > 0 ||
      pd.artists.length > 0 ||
      !!pd.dressCode ||
      !!pd.photographer ||
      !!pd.foodAndDrinks ||
      pd.parking ||
      pd.cloakroom);

  const md = event.masterclassDetails;
  const hasMasterclassContent = !!md && (!!md.style || !!md.format || md.partnerRequired || md.sessions.length > 0);

  return (
    <article className="flex flex-col gap-4">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {isOwnerOrAdmin && !(event.status === "PUBLISHED" && event.moderationStatus === "APPROVED") && (
        <div className="rounded-app border border-night-primary/40 bg-night-primary/10 px-4 py-2.5 text-sm text-night-text">
          {event.status === "DRAFT"
            ? "Черновик — видно только вам. Ещё не опубликовано."
            : t.event.pendingModeration}
        </div>
      )}

      {event.media.length > 0 ? (
        <PublicEventGallery
          title={event.title}
          images={event.media.map((m) => ({ id: m.id, url: m.url, objectPosition: m.objectPosition, width: m.width, height: m.height }))}
        />
      ) : (
        event.photoUrl && <img src={event.photoUrl} alt={event.title} className="rounded-app" />
      )}

      <div>
        <p className="m-0 text-sm text-night-muted">
          {formatDateTime(event.startsAt)}
          {event.endsAt ? ` — ${formatDateTime(event.endsAt)}` : ""} · {event.city.nameRu}
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
          {event.latitude != null && event.longitude != null && (
            <>
              {" "}
              <a
                href={`https://www.google.com/maps?q=${event.latitude},${event.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-night-primary"
              >
                (на карте)
              </a>
            </>
          )}
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
        {event.capacity != null && (
          <p className="m-0 text-sm text-night-text">
            <strong>Вместимость:</strong> <span className="text-night-muted">{event.capacity}</span>
          </p>
        )}
        {event.externalLinkUrl && (
          <p className="m-0 text-sm">
            <a href={event.externalLinkUrl} target="_blank" rel="noopener noreferrer" className="text-night-primary">
              {t.event.registerExternal} →
            </a>
            {event.registrationEnabled && <span className="ml-2 text-night-success">· регистрация открыта</span>}
          </p>
        )}
      </Card>

      {event.priceOptions.length > 0 && (
        <div>
          <h2 className="m-0 mb-2 font-night text-base font-bold text-night-text">Билеты</h2>
          <div className="flex flex-col gap-1.5">
            {event.priceOptions.map((o) => (
              <div key={o.id} className="flex items-center justify-between rounded-app-sm border border-night-border bg-night-card px-3 py-2 text-sm">
                <span className="text-night-text">{o.label}</span>
                <span className="text-night-muted">{o.price != null ? `${o.price} ${o.currency ?? ""}`.trim() : "—"}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {event.format === "PARTY" && hasPartyContent && event.partyDetails && (
        <div className="flex flex-col gap-1.5">
          <h2 className="m-0 mb-1 font-night text-base font-bold text-night-text">О вечеринке</h2>
          {event.partyDetails.musicStyles.length > 0 && (
            <p className="m-0 text-sm text-night-text">
              <strong>Музыкальные стили:</strong> <span className="text-night-muted">{event.partyDetails.musicStyles.join(", ")}</span>
            </p>
          )}
          {event.partyDetails.djs.length > 0 && (
            <p className="m-0 text-sm text-night-text">
              <strong>Диджеи:</strong> <span className="text-night-muted">{event.partyDetails.djs.join(", ")}</span>
            </p>
          )}
          {event.partyDetails.danceFloors.length > 0 && (
            <p className="m-0 text-sm text-night-text">
              <strong>Танцполы:</strong> <span className="text-night-muted">{event.partyDetails.danceFloors.join(", ")}</span>
            </p>
          )}
          {event.partyDetails.artists.length > 0 && (
            <p className="m-0 text-sm text-night-text">
              <strong>Артисты:</strong> <span className="text-night-muted">{event.partyDetails.artists.join(", ")}</span>
            </p>
          )}
          {event.partyDetails.dressCode && (
            <p className="m-0 text-sm text-night-text">
              <strong>Дресс-код:</strong> <span className="text-night-muted">{event.partyDetails.dressCode}</span>
            </p>
          )}
          {event.partyDetails.photographer && (
            <p className="m-0 text-sm text-night-text">
              <strong>Фотограф:</strong> <span className="text-night-muted">{event.partyDetails.photographer}</span>
            </p>
          )}
          {event.partyDetails.foodAndDrinks && (
            <p className="m-0 text-sm text-night-text">
              <strong>Еда и напитки:</strong> <span className="text-night-muted">{event.partyDetails.foodAndDrinks}</span>
            </p>
          )}
          {(event.partyDetails.parking || event.partyDetails.cloakroom) && (
            <p className="m-0 text-sm text-night-muted">
              {[event.partyDetails.parking && "Парковка", event.partyDetails.cloakroom && "Гардероб"].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
      )}

      {event.format === "MASTERCLASS" && hasMasterclassContent && event.masterclassDetails && (
        <div className="flex flex-col gap-2">
          <h2 className="m-0 mb-1 font-night text-base font-bold text-night-text">О мастер-классе</h2>
          <div className="flex flex-col gap-1.5">
            {event.masterclassDetails.style && (
              <p className="m-0 text-sm text-night-text">
                <strong>Стиль:</strong> <span className="text-night-muted">{event.masterclassDetails.style}</span>
              </p>
            )}
            {event.masterclassDetails.format && (
              <p className="m-0 text-sm text-night-text">
                <strong>Формат:</strong> <span className="text-night-muted">{event.masterclassDetails.format}</span>
              </p>
            )}
            {event.masterclassDetails.partnerRequired && <p className="m-0 text-sm text-night-muted">Требуется партнёр</p>}
          </div>

          {event.masterclassDetails.sessions.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {event.masterclassDetails.sessions.map((s) => (
                <div key={s.id} className="rounded-app-sm border border-night-border bg-night-card px-3 py-2 text-sm">
                  <p className="m-0 font-semibold text-night-text">{s.title}</p>
                  <p className="m-0 text-night-muted">
                    {formatDateTime(s.startTime)}
                    {" – "}
                    {formatDateTime(s.endTime)}
                    {s.room ? ` · ${s.room}` : ""}
                    {s.teacher ? ` · ${s.teacher.name}` : ""}
                    {s.level ? ` · ${t.event.levels[s.level]}` : ""}
                    {s.capacity != null ? ` · до ${s.capacity} чел.` : ""}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
