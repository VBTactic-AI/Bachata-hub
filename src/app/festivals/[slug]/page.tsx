import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getFestivalBySlug, computeFestivalStatus } from "@/server/events/festival-service";
import { listPublicPassesForEvent } from "@/server/events/pass-service";
import { listPublicFestivalSponsors } from "@/server/events/festival-sponsor-service";
import { listPublicFestivalFaqItems } from "@/server/events/festival-faq-service";
import { listPublicFestivalReviews } from "@/server/events/festival-review-service";
import { listPublicGuestQuestions } from "@/server/events/festival-guest-question-service";
import { getCurrentUser } from "@/lib/auth";
import { formatDateTime, formatEventDate, formatEventTime } from "@/lib/format";
import { safeJsonLd } from "@/lib/json-ld";
import { EventRegistrationButton } from "@/components/EventRegistrationButton";
import { FestivalReviewForm } from "@/components/FestivalReviewForm";
import { FestivalGuestQuestionForm } from "@/components/FestivalGuestQuestionForm";
import { Card } from "@/components/ui/card";
import { Tag } from "@/components/ui/tag";

const PROGRAM_ITEM_TYPE_LABELS: Record<string, string> = {
  WORKSHOP: "Мастер-класс",
  PARTY: "Вечеринка",
  COMPETITION: "Конкурс",
  OTHER: "Другое",
};

const REFUND_POLICY_LABELS: Record<string, string> = {
  NONE: "Без возврата",
  UNTIL_DATE: "Возврат до даты",
  PARTIAL: "Частичный возврат (с комиссией)",
  FULL: "Полный возврат в любой момент",
};

async function getVisibleFestival(slug: string) {
  const festival = await getFestivalBySlug(slug);
  if (!festival) return null;
  return festival;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const festival = await getVisibleFestival(slug);
  if (!festival) return {};
  return {
    title: festival.name,
    description: festival.description?.slice(0, 160) ?? undefined,
  };
}

// Публичная страница фестиваля (перенос UI, Stage UI-5, последняя стадия —
// docs/PROGRESS.md, Festival Engine UI transfer). Видимость = вычисляемый
// статус PUBLISHED (computeFestivalStatus, docs/FESTIVAL_ENGINE_ER.md) —
// либо владелец/ADMIN превью до публикации (тот же приём, что и
// /events/[slug]/page.tsx). "Покупка" Pass здесь ТОЛЬКО информационная —
// в проекте нет онлайн-эквайринга нигде (см. комментарий у модели Ticket в
// schema.prisma), реальная выдача Pass — организатором вручную после того,
// как гость зарегистрировался (EventRegistrationButton на bridge-Event).
export default async function FestivalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const festival = await getVisibleFestival(slug);
  const user = await getCurrentUser();
  const isOwnerOrAdmin = !!user && (user.id === festival?.createdById || user.role === "ADMIN");

  if (!festival) notFound();
  const status = computeFestivalStatus(festival);
  if (status !== "PUBLISHED" && !isOwnerOrAdmin) notFound();

  const bridgeEvent = festival.event;
  const dancer = user ? await prisma.dancer.findUnique({ where: { userId: user.id } }) : null;

  const [myRegistration, ticket, passes, sponsors, faqItems, reviews, guestQuestions] = await Promise.all([
    dancer && bridgeEvent
      ? prisma.eventRegistration.findUnique({ where: { eventId_dancerId: { eventId: bridgeEvent.id, dancerId: dancer.id } } })
      : Promise.resolve(null),
    dancer && bridgeEvent
      ? prisma.ticket.findFirst({
          where: { eventId: bridgeEvent.id, dancerId: dancer.id, passId: { not: null }, status: "ISSUED", isPaid: true },
        })
      : Promise.resolve(null),
    bridgeEvent ? listPublicPassesForEvent(bridgeEvent.id) : Promise.resolve([]),
    listPublicFestivalSponsors(festival.id),
    listPublicFestivalFaqItems(festival.id),
    listPublicFestivalReviews(festival.id),
    listPublicGuestQuestions(festival.id),
  ]);

  const avgRating = reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : null;

  // Программа по дням — та же группировка, что и у сессий мастер-класса на
  // /events/[slug]/page.tsx.
  const programDays: [string, typeof festival.programItems][] =
    festival.programItems.length > 0
      ? Array.from(
          festival.programItems.reduce((map, item) => {
            const key = formatEventDate(item.startTime);
            const list = map.get(key) ?? [];
            list.push(item);
            map.set(key, list);
            return map;
          }, new Map<string, typeof festival.programItems>())
        )
      : [];

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const pageUrl = `${siteUrl}/festivals/${festival.slug}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: festival.name,
    startDate: festival.startsAt.toISOString(),
    endDate: festival.endsAt?.toISOString(),
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    eventStatus: "https://schema.org/EventScheduled",
    location: { "@type": "Place", name: festival.venueName ?? festival.city.nameRu, address: festival.city.nameRu },
    description: festival.description ?? undefined,
  };

  return (
    <article className="flex flex-col gap-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />

      {isOwnerOrAdmin && status !== "PUBLISHED" && (
        <div className="rounded-app border border-night-primary/40 bg-night-primary/10 px-4 py-2.5 text-sm text-night-text">
          {status === "DRAFT" ? "Черновик — видно только вам, ещё не опубликовано." : "Ждёт публикации — виден пока только вам."}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <Tag className="bg-night-card2 text-night-pink">Фестиваль</Tag>
        <h1 className="m-0 font-night text-[1.7rem] font-extrabold leading-tight text-night-text sm:text-[2.1rem]">{festival.name}</h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
          <span className="font-semibold tabular-nums text-night-text">
            {formatDateTime(festival.startsAt)}
            {festival.endsAt ? ` — ${formatDateTime(festival.endsAt)}` : ""}
          </span>
        </div>
        <p className="m-0 text-sm text-night-muted">
          {festival.venueName ? `${festival.venueName} · ` : ""}
          {festival.city.nameRu}
        </p>
        {festival.description && <p className="m-0 max-w-[64ch] whitespace-pre-wrap text-sm leading-relaxed text-night-muted">{festival.description}</p>}
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px] lg:items-start">
        <main className="flex min-w-0 flex-col gap-8">
          {programDays.length > 0 && (
            <section>
              <h2 className="m-0 mb-3 font-night text-base font-bold text-night-text">Программа</h2>
              <div className="flex flex-col gap-5">
                {programDays.map(([day, items]) => (
                  <div key={day}>
                    <p className="m-0 mb-2 text-xs font-bold uppercase tracking-wide text-night-muted">{day}</p>
                    <div className="flex flex-col gap-2">
                      {items.map((item) => {
                        const body = (
                          <>
                            <div className="flex items-center justify-between gap-2">
                              <p className="m-0 text-sm font-semibold text-night-text">{item.title}</p>
                              <span className="shrink-0 rounded-full bg-night-card2 px-2.5 py-1 text-xs font-semibold text-night-pink">
                                {PROGRAM_ITEM_TYPE_LABELS[item.type] ?? item.type}
                              </span>
                            </div>
                            <p className="m-0 mt-0.5 text-xs text-night-muted">
                              {[
                                formatEventTime(item.startTime),
                                item.teacher?.name,
                                item.capacity != null && item.showCapacityPublicly ? `до ${item.capacity} чел.` : null,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          </>
                        );
                        return (
                          <div key={item.id} className="rounded-app-sm border border-night-border bg-night-card px-3.5 py-3">
                            {item.linkedEvent ? (
                              <a href={`/events/${item.linkedEvent.slug}`} className="block no-underline hover:no-underline">
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
            </section>
          )}

          {passes.length > 0 && (
            <section>
              <h2 className="m-0 mb-3 font-night text-base font-bold text-night-text">Пассы</h2>
              <div className="flex flex-col gap-2">
                {passes.map((p) => (
                  <div key={p.id} className="rounded-app-sm border border-night-border bg-night-card px-3.5 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-night-text">{p.name}</span>
                      <span className="tabular-nums text-night-muted">{p.price != null ? `${p.price} ${p.currency ?? ""}`.trim() : "Бесплатно"}</span>
                    </div>
                    {p.description && <p className="m-0 mt-1 text-sm text-night-muted">{p.description}</p>}
                    <p className="m-0 mt-1 text-xs text-night-muted">
                      {p.status === "SOLD_OUT" ? "Мест не осталось" : "Условия возврата: "}
                      {p.status !== "SOLD_OUT" && (REFUND_POLICY_LABELS[p.refundPolicy] ?? p.refundPolicy)}
                    </p>
                  </div>
                ))}
              </div>
              <p className="m-0 mt-2 text-xs text-night-muted">
                Чтобы купить Pass, сначала зарегистрируйтесь ниже — организатор свяжется с вами и оформит оплату.
              </p>
            </section>
          )}

          {sponsors.length > 0 && (
            <section>
              <h2 className="m-0 mb-3 font-night text-base font-bold text-night-text">Партнёры фестиваля</h2>
              <div className="flex flex-wrap gap-3">
                {sponsors.map((s) => (
                  <div key={s.id} className="flex flex-col items-center gap-1 rounded-app-sm border border-night-border bg-night-card px-4 py-3 text-center">
                    {s.logoUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.logoUrl} alt={s.name} className="h-10 w-auto object-contain" />
                    )}
                    {s.websiteUrl ? (
                      <a href={s.websiteUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-night-text hover:text-night-primary">
                        {s.name}
                      </a>
                    ) : (
                      <span className="text-sm font-semibold text-night-text">{s.name}</span>
                    )}
                    <span className="text-xs text-night-muted">{s.tier}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {faqItems.length > 0 && (
            <section>
              <h2 className="m-0 mb-3 font-night text-base font-bold text-night-text">Частые вопросы</h2>
              <div className="flex flex-col gap-2">
                {faqItems.map((item) => (
                  <details key={item.id} className="rounded-app-sm border border-night-border bg-night-card px-3.5 py-3">
                    <summary className="cursor-pointer text-sm font-semibold text-night-text">{item.question}</summary>
                    <p className="m-0 mt-2 whitespace-pre-wrap text-sm text-night-muted">{item.answer}</p>
                  </details>
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="m-0 mb-3 font-night text-base font-bold text-night-text">
              Отзывы участников{avgRating != null ? ` · ${avgRating.toFixed(1)} ★` : ""}
            </h2>
            {reviews.length > 0 && (
              <div className="mb-3 flex flex-col gap-2">
                {reviews.map((r) => (
                  <div key={r.id} className="rounded-app-sm border border-night-border bg-night-card px-3.5 py-3">
                    <span className="text-sm text-night-pink">{"★".repeat(r.rating)}</span>
                    <p className="m-0 mt-1 text-sm text-night-muted">{r.text}</p>
                  </div>
                ))}
              </div>
            )}
            <FestivalReviewForm festivalId={festival.id} loggedIn={!!user} />
          </section>

          <section>
            <h2 className="m-0 mb-3 font-night text-base font-bold text-night-text">Вопросы гостей</h2>
            {guestQuestions.length > 0 && (
              <div className="mb-3 flex flex-col gap-2">
                {guestQuestions.map((q) => (
                  <div key={q.id} className="rounded-app-sm border border-night-border bg-night-card px-3.5 py-3">
                    <p className="m-0 text-sm font-semibold text-night-text">
                      {q.askerName || "Гость"}: {q.question}
                    </p>
                    <p className="m-0 mt-1 text-sm text-night-muted">{q.answer ? q.answer : "Ожидает ответа организатора"}</p>
                  </div>
                ))}
              </div>
            )}
            <FestivalGuestQuestionForm festivalId={festival.id} />
          </section>
        </main>

        <aside className="flex flex-col gap-3 lg:sticky lg:top-20 lg:self-start">
          <Card className="flex flex-col gap-3 border-night-border bg-night-card">
            {bridgeEvent && (
              <div className="flex flex-col gap-1.5">
                <EventRegistrationButton eventSlug={bridgeEvent.slug} initialStatus={myRegistration?.status ?? null} loggedIn={!!user} />
              </div>
            )}
            {ticket && (
              <a
                href={`/profile/festivals/${festival.slug}`}
                className="block rounded-full border border-night-border px-4 py-2.5 text-center text-sm font-semibold text-night-text no-underline hover:border-night-primary hover:no-underline"
              >
                🎫 Мой Pass и расписание
              </a>
            )}
          </Card>
        </aside>
      </div>
    </article>
  );
}
