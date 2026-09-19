import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getFestivalBySlug, computeFestivalStatus } from "@/server/events/festival-service";
import { listPublicPassesForEvent, getCurrentPassPrice, type PublicPassRow } from "@/server/events/pass-service";
import { listPublicFestivalSponsors } from "@/server/events/festival-sponsor-service";
import { listPublicFestivalFaqItems } from "@/server/events/festival-faq-service";
import { listPublicFestivalReviews } from "@/server/events/festival-review-service";
import { listPublicGuestQuestions } from "@/server/events/festival-guest-question-service";
import { getCurrentUser } from "@/lib/auth";
import { formatEventDate, formatEventTime, formatEventDateRange } from "@/lib/format";
import { safeJsonLd } from "@/lib/json-ld";
import { EventRegistrationButton } from "@/components/EventRegistrationButton";
import { FestivalReviewForm } from "@/components/FestivalReviewForm";
import { FestivalGuestQuestionForm } from "@/components/FestivalGuestQuestionForm";
import { FestivalPublicProgram, type PublicProgramItem } from "@/components/FestivalPublicProgram";
import { Card } from "@/components/ui/card";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/cn";

const REFUND_POLICY_LABELS: Record<string, string> = {
  NONE: "Без возврата",
  UNTIL_DATE: "Возврат до даты",
  PARTIAL: "Частичный возврат (с комиссией)",
  FULL: "Полный возврат в любой момент",
};

// Активный ценовой период Pass прямо сейчас — тот же фильтр, что и внутри
// getCurrentPassPrice() (door-sale-service.ts использует её же для чекаута),
// здесь дополнительно нужен сам объект тира (не только цену), чтобы показать
// дедлайн (validUntil) как обратный отсчёт.
function getActiveTier(tiers: PublicPassRow["priceTiers"], now: Date = new Date()) {
  const active = tiers
    .filter((t) => (t.validFrom == null || t.validFrom <= now) && (t.validUntil == null || t.validUntil >= now))
    .sort((a, b) => b.sortOrder - a.sortOrder);
  return active[0] ?? null;
}

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
  const teacherNames = [...new Map(festival.programItems.filter((i) => i.teacher).map((i) => [i.teacher!.id, i.teacher!.name])).values()];

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

      {festival.coverUrl && (
        <div className="relative -mx-4 aspect-[21/9] overflow-hidden sm:mx-0 sm:rounded-app">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={festival.coverUrl} alt="" className="h-full w-full object-cover" />
        </div>
      )}

      <div className="flex flex-col gap-3">
        <Tag className="bg-night-card2 text-night-pink">Фестиваль · {festival.city.nameRu}</Tag>
        <h1 className="m-0 font-night text-[1.7rem] font-extrabold leading-tight text-night-text sm:text-[2.1rem]">{festival.name}</h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-night-muted">
          <span>
            📅 <b className="font-semibold text-night-text">{formatEventDateRange(festival.startsAt, festival.endsAt)}</b>
          </span>
          <span>
            📍 <b className="font-semibold text-night-text">{festival.venueName ?? festival.city.nameRu}</b>
          </span>
          {teacherNames.length > 0 && (
            <span>
              🎓 <b className="font-semibold text-night-text">{teacherNames.length} преподавателей</b>
            </span>
          )}
          {festival.programItems.length > 0 && (
            <span>
              🕺 <b className="font-semibold text-night-text">{festival.programItems.length} пунктов программы</b>
            </span>
          )}
        </div>
        {festival.description && <p className="m-0 max-w-[64ch] whitespace-pre-wrap text-sm leading-relaxed text-night-muted">{festival.description}</p>}
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px] lg:items-start">
        <main className="flex min-w-0 flex-col gap-8">
          {programDays.length > 0 && (
            <section>
              <h2 className="m-0 mb-3 font-night text-base font-bold text-night-text">Программа</h2>
              <FestivalPublicProgram
                days={programDays.map(([day, items]) => [
                  day,
                  items.map(
                    (item): PublicProgramItem => ({
                      id: item.id,
                      title: item.title,
                      type: item.type,
                      timeLabel: formatEventTime(item.startTime),
                      teacherName: item.teacher?.name ?? null,
                      capacity: item.capacity,
                      showCapacityPublicly: item.showCapacityPublicly,
                      linkedEventSlug: item.linkedEvent?.slug ?? null,
                    })
                  ),
                ])}
              />
            </section>
          )}

          {teacherNames.length > 0 && (
            <section>
              <h2 className="m-0 mb-3 font-night text-base font-bold text-night-text">Преподаватели</h2>
              <div className="flex flex-wrap gap-2">
                {teacherNames.map((name) => (
                  <span key={name} className="rounded-full border border-night-border bg-night-card px-3.5 py-2 text-sm font-semibold text-night-text">
                    {name}
                  </span>
                ))}
              </div>
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
            <h2 className="m-0 mb-3 font-night text-base font-bold text-night-text">Отзывы участников</h2>
            {avgRating != null && (
              <div className="mb-3 flex items-center gap-3">
                <span className="font-night text-3xl font-extrabold text-night-text">{avgRating.toFixed(1)}</span>
                <div>
                  <p className="m-0 tracking-wide text-night-pink">{"★".repeat(Math.round(avgRating))}{"☆".repeat(5 - Math.round(avgRating))}</p>
                  <p className="m-0 text-xs text-night-muted">
                    {reviews.length} {reviews.length === 1 ? "отзыв" : "отзывов"}
                  </p>
                </div>
              </div>
            )}
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
          {passes.length > 0 && (
            <div>
              <h3 className="m-0 mb-2 text-sm font-bold text-night-text">Пассы</h3>
              <div className="flex flex-col gap-3">
                {passes.map((p, i) => {
                  const activeTier = getActiveTier(p.priceTiers);
                  const effective = getCurrentPassPrice(p, p.priceTiers);
                  const basePrice = p.price == null ? null : Number(p.price);
                  const showStrike = activeTier != null && basePrice != null && effective.price != null && effective.price < basePrice;
                  const highlighted = i === 0;
                  return (
                    <div
                      key={p.id}
                      className={cn(
                        "rounded-app border p-4",
                        highlighted ? "border-night-primary bg-gradient-to-b from-night-primary/10 to-night-card" : "border-night-border bg-night-card"
                      )}
                    >
                      {activeTier?.validUntil && (
                        <span className="mb-2 inline-block rounded-app-sm bg-night-warning/15 px-2 py-1 text-[11px] font-bold text-night-warning">
                          🔥 {activeTier.label} до {formatEventDate(activeTier.validUntil)}
                        </span>
                      )}
                      <p className="m-0 text-sm font-extrabold text-night-text">{p.name}</p>
                      <p className="m-0 mt-1 flex items-baseline gap-1.5 text-xl font-extrabold text-night-text">
                        {effective.price != null ? `${effective.price} ${effective.currency ?? ""}`.trim() : "Бесплатно"}
                        {showStrike && <s className="text-sm font-normal text-night-muted">{basePrice}</s>}
                      </p>
                      {p.description && <p className="m-0 mt-1.5 text-xs leading-relaxed text-night-muted">{p.description}</p>}
                      <p className="m-0 mt-2 text-xs text-night-muted">
                        {p.status === "SOLD_OUT" ? "Мест не осталось" : `↩ ${REFUND_POLICY_LABELS[p.refundPolicy] ?? p.refundPolicy}`}
                      </p>
                      {p.status !== "SOLD_OUT" && (
                        <a
                          href="#register"
                          className={cn(
                            "mt-3 block rounded-full py-2.5 text-center text-sm font-bold no-underline hover:no-underline",
                            highlighted ? "bg-gradient-to-r from-night-primary to-[#d6006c] text-white" : "border border-night-border text-night-text"
                          )}
                        >
                          Купить {p.name}
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="m-0 mt-2 text-xs text-night-muted">
                Онлайн-оплаты нет — зарегистрируйтесь ниже, организатор свяжется с вами и оформит выдачу Pass.
              </p>
            </div>
          )}

          <Card id="register" className="flex flex-col gap-3 border-night-border bg-night-card">
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
