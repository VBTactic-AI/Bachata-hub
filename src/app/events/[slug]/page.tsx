import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { t } from "@/lib/i18n/dictionary";
import { formatDateTime, formatEventDate, formatEventTime, formatRelativeDayLabel } from "@/lib/format";
import { EVENT_FORMAT_COLOR } from "@/lib/event-format-colors";
import { COMPETITION_STATUS_LABELS } from "@/lib/competition-labels";
import { AttendanceButtons } from "@/components/AttendanceButtons";
import { EventRegistrationButton } from "@/components/EventRegistrationButton";
import { ShareButtons } from "@/components/ShareButtons";
import { PublicEventGallery } from "@/components/PublicEventGallery";
import { FollowButton } from "@/components/notifications/FollowButton";
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
      // Events Engine, этап 6 — программа фестиваля. linkedEvent — только
      // минимум для ссылки-карточки (slug/title/format), не весь Event.
      festivalDetails: {
        include: {
          programItems: {
            include: { teacher: true, linkedEvent: { select: { slug: true, title: true, format: true } } },
            orderBy: { order: "asc" },
          },
        },
      },
      // "О соревновании" (2026-09-14) — только публичные поля Competition
      // (rulesText/rulesUrl документированы в схеме как "для зрителей"),
      // без затрагивания остального движка слоя 3 (divisions — только имена
      // категорий для чипов, не сами дивизионы с их настройками).
      competition: {
        select: {
          id: true,
          status: true,
          rulesText: true,
          rulesUrl: true,
          divisions: { select: { category: { select: { name: true } } }, orderBy: { category: { order: "asc" } } },
        },
      },
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

// Заголовок секции с цветной плашкой-акцентом — цвет секции привязан к тому,
// к какому формату относятся данные под ним (EVENT_FORMAT_COLOR), а не к
// формату самого события: на одной странице могут быть и общие блоки
// ("Билеты", "Описание" — акцент night-primary по умолчанию), и блок про
// соревнование (акцент CONTEST), даже если событие оформлено как FESTIVAL.
function SectionTitle({ children, accent }: { children: ReactNode; accent?: string }) {
  return (
    <h2 className="m-0 mb-3 flex items-center gap-2.5 font-night text-base font-bold text-night-text">
      <span className="h-4 w-[3px] shrink-0 rounded-full" style={{ backgroundColor: accent ?? "#ff2d8a" }} />
      {children}
    </h2>
  );
}

// Список полей "лейбл — значение" — общий для блоков "О вечеринке"/"О
// мастер-классе": вызывающий код сам решает, какие строки достойны показа
// (см. partyRows/masterclassRows ниже), этот компонент просто ничего не
// рендерит, если список пуст, чтобы вызывающему не нужно было отдельно
// проверять "а стоит ли вообще выводить заголовок секции".
function InfoRows({ rows }: { rows: { k: string; v: ReactNode }[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="flex flex-col border-t border-night-border/60">
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-1 gap-1 border-b border-night-border/60 py-3 sm:grid-cols-[150px_1fr] sm:gap-4">
          <span className="text-sm text-night-muted">{r.k}</span>
          <span className="text-sm leading-relaxed text-night-text">{r.v}</span>
        </div>
      ))}
    </div>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4 shrink-0">
      <path d="M12 21s-7-6.1-7-11.5A7 7 0 0 1 19 9.5C19 14.9 12 21 12 21Z" />
      <circle cx="12" cy="9.5" r="2.4" />
    </svg>
  );
}

function BuildingIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4 shrink-0">
      <rect x="5" y="3.5" width="14" height="17" rx="1.2" />
      <path d="M9 20.5V17h6v3.5M9 7.5h1M9 11h1M14 7.5h1M14 11h1" />
    </svg>
  );
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

  // Events Engine, этап 4 — своя регистрация участника, независимая от
  // Attendance (RSVP) выше. Тот же паттерн запроса (через Dancer.userId).
  const myRegistration = user
    ? await prisma.dancer
        .findUnique({ where: { userId: user.id } })
        .then((dancer) =>
          dancer
            ? prisma.eventRegistration.findUnique({
                where: { eventId_dancerId: { eventId: event.id, dancerId: dancer.id } },
              })
            : null
        )
    : null;

  const existingSubscription = user
    ? await prisma.subscription.findUnique({
        where: { userId_type_targetId: { userId: user.id, type: "EVENT", targetId: event.id } },
      })
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
  const relativeDay = formatRelativeDayLabel(event.startsAt);

  // Строки блока "О вечеринке"/"О мастер-классе" — только заполненные поля
  // (по прямому запросу пользователя, 2026-09-14: "выводи только тогда,
  // когда они заполнены"). PartyDetails/MasterclassDetails создаются при
  // каждом сохранении черновика этого формата (event-service.ts), даже если
  // организатор ничего в шаге не заполнил, поэтому проверка нужна на каждое
  // поле отдельно, а не только на факт существования самой записи.
  const partyRows: { k: string; v: ReactNode }[] = [];
  if (event.format === "PARTY" && event.partyDetails) {
    const pd = event.partyDetails;
    if (pd.musicStyles.length > 0) partyRows.push({ k: "Музыкальные стили", v: pd.musicStyles.join(", ") });
    if (pd.djs.length > 0) partyRows.push({ k: "Диджеи", v: pd.djs.join(", ") });
    if (pd.danceFloors.length > 0) partyRows.push({ k: "Танцполы", v: pd.danceFloors.join(", ") });
    if (pd.artists.length > 0) partyRows.push({ k: "Артисты", v: pd.artists.join(", ") });
    if (pd.dressCode) partyRows.push({ k: "Дресс-код", v: pd.dressCode });
    if (pd.photographer) partyRows.push({ k: "Фотограф", v: pd.photographer });
    if (pd.foodAndDrinks) partyRows.push({ k: "Еда и напитки", v: pd.foodAndDrinks });
    if (pd.parking || pd.cloakroom) {
      partyRows.push({ k: "Удобства", v: [pd.parking && "Парковка", pd.cloakroom && "Гардероб"].filter(Boolean).join(" · ") });
    }
  }

  const masterclassRows: { k: string; v: ReactNode }[] = [];
  if (event.format === "MASTERCLASS" && event.masterclassDetails) {
    const md = event.masterclassDetails;
    if (md.style) masterclassRows.push({ k: "Стиль", v: md.style });
    if (md.format) masterclassRows.push({ k: "Формат", v: md.format });
    if (md.partnerRequired) masterclassRows.push({ k: "Партнёр", v: "Нужен свой партнёр" });
  }

  // Расписание по дням — группировка по календарной дате сессии, сама
  // структура (day → sessions[]) не хранится отдельно, дни выводятся в
  // порядке первого появления (сессии уже отсортированы по полю order).
  const sessions = event.masterclassDetails?.sessions ?? [];
  const sessionDays: [string, typeof sessions][] =
    sessions.length > 0
      ? Array.from(
          sessions.reduce((map, s) => {
            const key = formatEventDate(s.startTime);
            const list = map.get(key) ?? [];
            list.push(s);
            map.set(key, list);
            return map;
          }, new Map<string, typeof sessions>())
        )
      : [];

  // Events Engine, этап 6 — та же группировка по дням, что и у расписания
  // мастер-класса выше, только источник — EventProgramItem.
  const programItems = event.festivalDetails?.programItems ?? [];
  const programDays: [string, typeof programItems][] =
    programItems.length > 0
      ? Array.from(
          programItems.reduce((map, p) => {
            const key = formatEventDate(p.startTime);
            const list = map.get(key) ?? [];
            list.push(p);
            map.set(key, list);
            return map;
          }, new Map<string, typeof programItems>())
        )
      : [];
  const PROGRAM_TYPE_LABELS: Record<string, string> = { WORKSHOP: "Мастер-класс", PARTY: "Вечеринка", COMPETITION: "Конкурс", OTHER: "Другое" };

  const competition = event.competition;
  const divisionNames = competition ? Array.from(new Set(competition.divisions.map((d) => d.category.name))) : [];

  // Факты справа — Уровень есть у любого события (обязательное поле),
  // Вместимость/Цена — только когда организатор их заполнил.
  const facts: { l: string; v: string }[] = [{ l: t.event.level, v: t.event.levels[event.level] }];
  if (event.capacity != null) facts.push({ l: "Вместимость", v: `${event.capacity} чел.` });
  if (event.priceText) facts.push({ l: t.event.price, v: event.priceText });

  const formatAccent = EVENT_FORMAT_COLOR[event.format];

  return (
    <article className="flex flex-col gap-6">
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

      <div className="flex flex-col gap-3">
        <div>
          <Tag style={{ backgroundColor: `${formatAccent}26`, color: formatAccent }}>{t.event.formats[event.format]}</Tag>
          <Tag className="bg-night-card2 text-night-pink">{t.event.levels[event.level]}</Tag>
          {event.certainty === "TENTATIVE" && (
            <Badge variant="community" className="bg-night-primary/15 text-night-primary">
              {t.event.tentativeBadgeTitle}
            </Badge>
          )}
          {isPast && (
            <Badge variant="community" className="bg-night-card2 text-night-muted">
              {t.event.pastEvent}
            </Badge>
          )}
        </div>

        <h1 className="m-0 font-night text-[1.7rem] font-extrabold leading-tight text-night-text sm:text-[2.1rem]">{event.title}</h1>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
          {relativeDay && (
            <span className="rounded-full bg-night-primary/15 px-2.5 py-1 text-[0.72rem] font-bold uppercase tracking-wide text-night-primary">
              {relativeDay}
            </span>
          )}
          <span className="font-semibold tabular-nums text-night-text">
            {formatDateTime(event.startsAt)}
            {event.endsAt ? ` — ${formatDateTime(event.endsAt)}` : ""}
          </span>
          {event.certainty === "TENTATIVE" && (
            <span className="text-night-muted">({t.event.tentativeBadgeSubtitle})</span>
          )}
        </div>

        <div className="flex flex-col gap-1.5 text-sm text-night-muted sm:flex-row sm:flex-wrap sm:gap-x-5 sm:gap-y-1.5">
          <span className="flex items-center gap-1.5">
            <PinIcon />
            {event.venueName}
            {event.venueAddress ? `, ${event.venueAddress}` : ""} · {event.city.nameRu}
            {event.latitude != null && event.longitude != null && (
              <a
                href={`https://www.google.com/maps?q=${event.latitude},${event.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-night-primary"
              >
                (на карте)
              </a>
            )}
          </span>
          <span className="flex items-center gap-1.5">
            <BuildingIcon />
            {event.school ? (
              <a href={`/schools/${event.school.slug}`} className="text-night-text underline decoration-night-border underline-offset-2 hover:text-night-primary hover:decoration-night-primary">
                {event.school.name}
              </a>
            ) : (
              <span>{event.organizerName || "—"}</span>
            )}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px] lg:items-start">
        <main className="flex min-w-0 flex-col gap-8">
          {partyRows.length > 0 && (
            <section>
              <SectionTitle accent={EVENT_FORMAT_COLOR.PARTY}>О вечеринке</SectionTitle>
              <InfoRows rows={partyRows} />
            </section>
          )}

          {masterclassRows.length > 0 && (
            <section>
              <SectionTitle accent={EVENT_FORMAT_COLOR.MASTERCLASS}>О мастер-классе</SectionTitle>
              <InfoRows rows={masterclassRows} />
            </section>
          )}

          {sessionDays.length > 0 && (
            <section>
              <SectionTitle accent={EVENT_FORMAT_COLOR.MASTERCLASS}>Расписание</SectionTitle>
              <div className="flex flex-col gap-5">
                {sessionDays.map(([day, list]) => (
                  <div key={day}>
                    <p className="m-0 mb-2 text-xs font-bold uppercase tracking-wide text-night-muted">{day}</p>
                    <div className="flex flex-col gap-2">
                      {list.map((s) => (
                        <div
                          key={s.id}
                          className="grid grid-cols-[64px_1fr] items-start gap-3 rounded-app-sm border border-night-border bg-night-card px-3.5 py-3 sm:grid-cols-[90px_1fr]"
                        >
                          <span className="text-sm font-bold tabular-nums text-night-text">{formatEventTime(s.startTime)}</span>
                          <div className="min-w-0">
                            <p className="m-0 text-sm font-semibold text-night-text">{s.title}</p>
                            <p className="m-0 mt-0.5 text-xs text-night-muted">
                              {[s.teacher?.name, s.level ? t.event.levels[s.level] : null, s.room, s.capacity != null ? `до ${s.capacity} чел.` : null]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {programDays.length > 0 && (
            <section>
              <SectionTitle accent={EVENT_FORMAT_COLOR.FESTIVAL}>Программа</SectionTitle>
              <div className="flex flex-col gap-5">
                {programDays.map(([day, list]) => (
                  <div key={day}>
                    <p className="m-0 mb-2 text-xs font-bold uppercase tracking-wide text-night-muted">{day}</p>
                    <div className="flex flex-col gap-2">
                      {list.map((p) => (
                        <div
                          key={p.id}
                          className="grid grid-cols-[64px_1fr] items-start gap-3 rounded-app-sm border border-night-border bg-night-card px-3.5 py-3 sm:grid-cols-[90px_1fr]"
                        >
                          <span className="text-sm font-bold tabular-nums text-night-text">{formatEventTime(p.startTime)}</span>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="m-0 text-sm font-semibold text-night-text">{p.title}</p>
                              <Tag className="border border-night-border bg-transparent text-night-muted">{PROGRAM_TYPE_LABELS[p.type] ?? p.type}</Tag>
                            </div>
                            {p.teacher?.name && <p className="m-0 mt-0.5 text-xs text-night-muted">{p.teacher.name}</p>}
                            {p.linkedEvent && (
                              <a href={`/events/${p.linkedEvent.slug}`} className="text-xs text-night-primary hover:underline">
                                Страница события →
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {competition && (
            <section>
              <SectionTitle accent={EVENT_FORMAT_COLOR.CONTEST}>О соревновании</SectionTitle>
              <div className="flex flex-col gap-3 rounded-app border border-night-border bg-night-card p-4">
                <div>
                  <Tag className="bg-night-card2 text-night-pink">{COMPETITION_STATUS_LABELS[competition.status]}</Tag>
                  {divisionNames.map((name) => (
                    <Tag key={name} className="border border-night-border bg-transparent text-night-muted">
                      {name}
                    </Tag>
                  ))}
                </div>
                {competition.rulesText && (
                  <p className="m-0 whitespace-pre-wrap text-sm leading-relaxed text-night-muted">{competition.rulesText}</p>
                )}
                <div className="flex flex-wrap gap-2 pt-1">
                  <a
                    href={`/compete/${competition.id}`}
                    className="rounded-full border border-night-border px-4 py-2 text-sm font-semibold text-night-text no-underline hover:border-night-primary hover:text-night-primary hover:no-underline"
                  >
                    Страница соревнования →
                  </a>
                  {competition.status === "REGISTRATION_OPEN" && (
                    <a
                      href={`/compete/${competition.id}/register`}
                      className="rounded-full bg-gradient-night-cta px-4 py-2 text-sm font-bold text-white no-underline hover:no-underline"
                    >
                      Регистрация участника →
                    </a>
                  )}
                  {competition.rulesUrl && (
                    <a
                      href={competition.rulesUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-full border border-night-border px-4 py-2 text-sm font-semibold text-night-text no-underline hover:border-night-primary hover:text-night-primary hover:no-underline"
                    >
                      Регламент →
                    </a>
                  )}
                </div>
              </div>
            </section>
          )}

          {event.priceOptions.length > 0 && (
            <section>
              <SectionTitle>Билеты</SectionTitle>
              <div className="flex flex-col gap-1.5">
                {event.priceOptions.map((o) => (
                  <div key={o.id} className="flex items-center justify-between rounded-app-sm border border-night-border bg-night-card px-3.5 py-2.5 text-sm">
                    <span className="text-night-text">{o.label}</span>
                    <span className="tabular-nums text-night-muted">{o.price != null ? `${o.price} ${o.currency ?? ""}`.trim() : "—"}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {event.description && (
            <section>
              <SectionTitle>{t.event.description}</SectionTitle>
              <p className="m-0 max-w-[64ch] whitespace-pre-wrap text-sm leading-relaxed text-night-muted">{event.description}</p>
            </section>
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
        </main>

        <aside className="flex flex-col gap-3 lg:sticky lg:top-20 lg:self-start">
          <Card className="flex flex-col gap-3 border-night-border bg-night-card">
            {facts.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {facts.map((f) => (
                  <div key={f.l} className="min-w-[92px] flex-1 rounded-app-sm border border-night-border bg-night-card2 px-3 py-2">
                    <div className="text-[0.64rem] font-semibold uppercase tracking-wide text-night-muted">{f.l}</div>
                    <div className="mt-1 text-sm font-bold tabular-nums text-night-text">{f.v}</div>
                  </div>
                ))}
              </div>
            )}

            {event.externalLinkUrl && (
              <div className="flex flex-col gap-1.5 border-t border-night-border/60 pt-3">
                <a
                  href={event.externalLinkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-full bg-gradient-night-cta px-4 py-3 text-center text-sm font-bold text-white no-underline hover:no-underline"
                >
                  {t.event.registerExternal} →
                </a>
              </div>
            )}

            {/* Events Engine, этап 4 — собственная регистрация (НЕ то же
                самое, что внешняя ссылка выше: организатор может включить
                и то, и другое одновременно, например платный вход по внешней
                ссылке + бесплатный учёт мест здесь). */}
            {event.registrationEnabled && (
              <div className="flex flex-col gap-1.5 border-t border-night-border/60 pt-3">
                <EventRegistrationButton eventSlug={event.slug} initialStatus={myRegistration?.status ?? null} loggedIn={!!user} />
              </div>
            )}

            <div className="flex flex-col gap-2 border-t border-night-border/60 pt-3">
              <AttendanceButtons eventSlug={event.slug} initialStatus={attendance?.status ?? null} loggedIn={!!user} />
              <FollowButton
                type="EVENT"
                targetId={event.id}
                loggedIn={!!user}
                initialSubscriptionId={existingSubscription?.id ?? null}
                labelFollow="🔔 Подписаться на событие"
              />
            </div>
          </Card>

          <Card className="border-night-border bg-night-card">
            <ShareButtons url={pageUrl} title={event.title} />
          </Card>
        </aside>
      </div>
    </article>
  );
}
