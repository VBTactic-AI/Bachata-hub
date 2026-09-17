import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { DanceLevel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { t } from "@/lib/i18n/dictionary";
import { safeJsonLd } from "@/lib/json-ld";
import { activeEventFilter } from "@/lib/events";
import { pluralizeRu } from "@/lib/format";
import { osmEmbedUrl } from "@/lib/map-embed";
import { VerificationBadge } from "@/components/VerificationBadge";
import { ReviewForm } from "@/components/ReviewForm";
import { FollowButton } from "@/components/notifications/FollowButton";
import { EventCard } from "@/components/EventCard";
import { PinIcon, PhoneIcon, MailIcon } from "@/components/Icon";
import { SchoolStickyHeader } from "@/components/schools/SchoolStickyHeader";
import { Card } from "@/components/ui/card";
import { Tag } from "@/components/ui/tag";

const LEVEL_BADGE_CLASS: Record<DanceLevel, string> = {
  BEGINNER: "bg-night-success/15 text-night-success",
  ALL_LEVELS: "bg-night-card2 text-night-pink",
  ADVANCED: "bg-night-primary/15 text-night-primary",
};

const WEEKDAY_ORDER = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

// userId передаётся только когда известен текущий пользователь — тогда в
// выборку дополнительно попадают его СОБСТВЕННЫЕ отзывы в любом статусе
// (PENDING/REJECTED), чтобы автор видел, что он написал и что с этим
// происходит. Всем остальным видны только APPROVED — отзыв никто, кроме
// автора и модераторов, не видит, пока модератор его не одобрит.
async function getSchool(slug: string, userId?: string) {
  return prisma.school.findUnique({
    where: { slug },
    include: {
      city: true,
      branches: { include: { city: true } },
      teachers: { where: { isActive: true } },
      schedules: { include: { teacher: true }, orderBy: { weekday: "asc" } },
      faqItems: { orderBy: { sortOrder: "asc" } },
      reviews: {
        where: userId
          ? { OR: [{ moderationStatus: "APPROVED" }, { authorId: userId }] }
          : { moderationStatus: "APPROVED" },
        include: { author: { include: { dancer: true } } },
        orderBy: { createdAt: "desc" },
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
  const school = await getSchool(slug);
  if (!school) return {};
  return {
    title: school.name,
    description:
      school.description?.slice(0, 160) ?? `${t.meta.schoolFallbackDescription} ${school.city.nameRu}`,
  };
}

export default async function SchoolPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  const school = await getSchool(slug, user?.id);
  if (!school || !school.isActive) notFound();

  // Рейтинг и schema.org-разметка считаются только по опубликованным
  // отзывам — собственный ещё не проверенный отзыв не должен влиять на то,
  // что видят поисковики и другие посетители.
  const publicReviews = school.reviews.filter((r) => r.moderationStatus === "APPROVED");
  const avgRating =
    publicReviews.length > 0
      ? publicReviews.reduce((sum, r) => sum + r.rating, 0) / publicReviews.length
      : null;
  const ratingBreakdown = [5, 4, 3, 2, 1].map((stars) => ({
    stars,
    count: publicReviews.filter((r) => r.rating === stars).length,
  }));

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: school.name,
    address: school.branches[0]?.address || school.city.nameRu,
    telephone: school.contactPhone || undefined,
    email: school.contactEmail || undefined,
    aggregateRating: avgRating
      ? {
          "@type": "AggregateRating",
          ratingValue: avgRating.toFixed(1),
          reviewCount: publicReviews.length,
        }
      : undefined,
  };

  const now = new Date();
  const [existingSubscription, subscriberCount, upcomingEvents] = await Promise.all([
    user
      ? prisma.subscription.findUnique({
          where: { userId_type_targetId: { userId: user.id, type: "SCHOOL", targetId: school.id } },
        })
      : Promise.resolve(null),
    prisma.subscription.count({ where: { type: "SCHOOL", targetId: school.id } }),
    prisma.event.findMany({
      where: { schoolId: school.id, ...activeEventFilter(), startsAt: { gte: now } },
      orderBy: { startsAt: "asc" },
      take: 4,
      include: { city: true, school: true, priceOptions: { orderBy: { order: "asc" } } },
    }),
  ]);

  const socialLinks = (school.socialLinks as { website?: string | null; instagram?: string | null } | null) ?? {};
  const scheduleByDay = WEEKDAY_ORDER.map((day) => ({
    day,
    items: school.schedules.filter((s) => s.weekday === day),
  })).filter((g) => g.items.length > 0);
  const trialContactHref = school.contactPhone
    ? `tel:${school.contactPhone.replace(/[^+\d]/g, "")}`
    : school.contactEmail
      ? `mailto:${school.contactEmail}`
      : null;

  return (
    <div className="flex flex-col gap-5 pb-4">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />

      <SchoolStickyHeader
        name={school.name}
        avatarLabel={initials(school.name)}
        ratingLabel={avgRating ? `★ ${avgRating.toFixed(1)}` : null}
      />

      <div className="relative overflow-hidden rounded-app border border-night-border bg-gradient-night-hero p-5 sm:p-8">
        <div className="flex flex-col items-start gap-2">
          <VerificationBadge status={school.verificationStatus} />
          <h1 className="m-0 font-night text-2xl font-extrabold tracking-tight text-night-text sm:text-3xl">{school.name}</h1>
          <p className="m-0 text-sm text-night-muted">{school.city.nameRu}</p>
          {avgRating && (
            <p className="m-0 flex items-center gap-1.5 text-sm text-night-muted">
              <span className="tracking-wide text-night-pink">{"★".repeat(Math.round(avgRating))}</span>
              <span className="font-bold text-night-text">{avgRating.toFixed(1)}</span>
              <span>
                · {publicReviews.length} {t.school.reviews.toLowerCase()}
              </span>
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <FollowButton
              type="SCHOOL"
              targetId={school.id}
              loggedIn={!!user}
              initialSubscriptionId={existingSubscription?.id ?? null}
            />
            {subscriberCount > 0 && (
              <span className="text-xs font-semibold text-night-muted">
                {subscriberCount} {pluralizeRu(subscriberCount, t.school.subscribersCount)}
              </span>
            )}
          </div>

          {school.directions.length > 0 && (
            <div className="mt-1">
              {school.directions.map((d) => (
                <Tag key={d} className="border border-white/10 bg-white/5 text-night-pink">
                  {d}
                </Tag>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <div className="rounded-app-sm border border-night-border bg-night-card px-2 py-3 text-center">
          <div className="text-lg font-extrabold text-night-pink">{avgRating ? avgRating.toFixed(1) : "—"}</div>
          <div className="mt-0.5 text-[10.5px] font-bold uppercase tracking-wide text-night-muted">{t.school.statRating}</div>
        </div>
        <div className="rounded-app-sm border border-night-border bg-night-card px-2 py-3 text-center">
          <div className="text-lg font-extrabold text-night-text">{publicReviews.length}</div>
          <div className="mt-0.5 text-[10.5px] font-bold uppercase tracking-wide text-night-muted">{t.school.statReviews}</div>
        </div>
        <div className="rounded-app-sm border border-night-border bg-night-card px-2 py-3 text-center">
          <div className="text-lg font-extrabold text-night-text">{subscriberCount}</div>
          <div className="mt-0.5 text-[10.5px] font-bold uppercase tracking-wide text-night-muted">{t.school.statSubscribers}</div>
        </div>
        <div className="rounded-app-sm border border-night-border bg-night-card px-2 py-3 text-center">
          <div className="text-lg font-extrabold text-night-text">{school.teachers.length}</div>
          <div className="mt-0.5 text-[10.5px] font-bold uppercase tracking-wide text-night-muted">{t.school.statTeachers}</div>
        </div>
        <div className="rounded-app-sm border border-night-border bg-night-card px-2 py-3 text-center">
          <div className="text-lg font-extrabold text-night-text">{school.branches.length}</div>
          <div className="mt-0.5 text-[10.5px] font-bold uppercase tracking-wide text-night-muted">{t.school.statBranches}</div>
        </div>
      </div>

      <div className="lg:grid lg:grid-cols-[1fr_320px] lg:items-start lg:gap-9">
        <div className="flex flex-col gap-5">
          {school.description && <p className="m-0 text-sm leading-relaxed text-night-muted">{school.description}</p>}

          {school.teachers.length > 0 && (
            <div>
              <h2 className="m-0 mb-2 font-night text-base font-bold text-night-text">{t.school.teachers}</h2>
              <div className="flex gap-3 overflow-x-auto pb-1 lg:grid lg:grid-cols-4 lg:overflow-visible">
                {school.teachers.map((teacher) => (
                  <Card key={teacher.id} className="w-[150px] shrink-0 border-night-border bg-night-card lg:w-auto">
                    {teacher.photoUrl ? (
                      <img
                        src={teacher.photoUrl}
                        alt={teacher.name}
                        className="mb-2 aspect-square rounded-lg object-cover"
                      />
                    ) : (
                      <div className="mb-2 flex aspect-square items-center justify-center rounded-lg bg-gradient-night-cta text-lg font-extrabold text-white">
                        {initials(teacher.name)}
                      </div>
                    )}
                    <strong className="text-night-text">{teacher.name}</strong>
                    {teacher.bio && <p className="mt-1 text-sm text-night-muted">{teacher.bio}</p>}
                  </Card>
                ))}
              </div>
            </div>
          )}

          {scheduleByDay.length > 0 && (
            <div>
              <h2 className="m-0 mb-2 font-night text-base font-bold text-night-text">{t.school.schedule}</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {scheduleByDay.map(({ day, items }) => (
                  <Card key={day} className="border-night-border bg-night-card">
                    <h3 className="m-0 mb-2 text-xs font-bold uppercase tracking-wide text-night-pink">{t.school.weekdays[day]}</h3>
                    <div className="flex flex-col gap-2">
                      {items.map((s) => (
                        <div key={s.id} className="flex items-center gap-2.5 border-b border-night-border pb-2 text-sm last:border-0 last:pb-0">
                          <span className="w-[82px] shrink-0 font-bold tabular-nums text-night-text">
                            {s.startTime}
                            {s.endTime ? `–${s.endTime}` : ""}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className={`mb-0.5 block w-fit rounded px-1.5 py-0.5 text-[10px] font-bold ${LEVEL_BADGE_CLASS[s.level]}`}>
                              {t.event.levels[s.level]}
                            </span>
                            <span className="block truncate text-night-muted">{s.teacher?.name ?? "—"}</span>
                          </span>
                          {s.hall && <span className="shrink-0 text-xs font-semibold text-night-disabled">{s.hall}</span>}
                        </div>
                      ))}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          <div>
            <h2 className="m-0 mb-2 font-night text-base font-bold text-night-text">{t.school.upcomingEventsTitle}</h2>
            {upcomingEvents.length === 0 ? (
              <p className="m-0 text-sm text-night-muted">{t.school.noUpcomingEvents}</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {upcomingEvents.map((event) => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
            )}
          </div>

          <div>
            <h2 className="m-0 mb-2 font-night text-base font-bold text-night-text">
              {t.school.reviews}
              {avgRating && (
                <span className="ml-2 tracking-wide text-night-pink">
                  {"★".repeat(Math.round(avgRating))} {avgRating.toFixed(1)}
                </span>
              )}
            </h2>

            {publicReviews.length > 0 && (
              <Card className="mb-3 flex items-center gap-5 border-night-border bg-night-card">
                <div className="shrink-0 text-center">
                  <div className="text-3xl font-extrabold text-night-text">{avgRating!.toFixed(1)}</div>
                  <div className="mt-1 text-xs text-night-muted">
                    {publicReviews.length} {t.school.reviews.toLowerCase()}
                  </div>
                </div>
                <div className="flex flex-1 flex-col gap-1">
                  {ratingBreakdown.map(({ stars, count }) => (
                    <div key={stars} className="flex items-center gap-2 text-xs text-night-muted">
                      <span className="w-3 shrink-0 tabular-nums">{stars}</span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-night-card2">
                        <div
                          className="h-full rounded-full bg-night-pink"
                          style={{ width: `${publicReviews.length ? (count / publicReviews.length) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="w-5 shrink-0 text-right tabular-nums">{count}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {school.reviews.length === 0 ? (
              <p className="text-sm text-night-muted">{t.school.noReviewsYet}</p>
            ) : (
              <div className="flex flex-col gap-3">
                {school.reviews.map((r) => (
                  <Card key={r.id} className="border-night-border bg-night-card">
                    <p className="m-0 tracking-wide text-night-pink">
                      {"★".repeat(r.rating)}
                      {"☆".repeat(5 - r.rating)}
                    </p>
                    <p className="mt-1.5 text-sm text-night-text">{r.text}</p>
                    <p className="mt-1.5 text-sm text-night-muted">
                      {r.author.dancer?.displayName ?? t.school.reviewAuthorFallback}
                    </p>
                    {/* Виден только автору — остальным такие отзывы не приходят с сервера вообще (см. getSchool) */}
                    {r.moderationStatus === "PENDING" && (
                      <p className="mt-1 text-sm text-night-pink">{t.school.reviewPendingBadge}</p>
                    )}
                    {r.moderationStatus === "REJECTED" && (
                      <p className="mt-1 text-sm text-night-muted">{t.school.reviewRejectedBadge}</p>
                    )}
                  </Card>
                ))}
              </div>
            )}
            <div className="mt-4">
              <ReviewForm schoolSlug={school.slug} loggedIn={!!user} />
            </div>
          </div>

          {school.faqItems.length > 0 && (
            <div>
              <h2 className="m-0 mb-2 font-night text-base font-bold text-night-text">{t.school.faqTitle}</h2>
              <div className="flex flex-col gap-2">
                {school.faqItems.map((item) => (
                  <details key={item.id} className="group rounded-app-sm border border-night-border bg-night-card">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3.5 text-sm font-bold text-night-text">
                      {item.question}
                      <svg
                        viewBox="0 0 20 20"
                        fill="none"
                        className="h-4 w-4 shrink-0 text-night-muted transition-transform group-open:rotate-180 group-open:text-night-pink"
                        aria-hidden="true"
                      >
                        <path d="M5 7.5 10 12.5 15 7.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </summary>
                    <p className="m-0 whitespace-pre-wrap px-4 pb-4 text-sm leading-relaxed text-night-muted">{item.answer}</p>
                  </details>
                ))}
              </div>
            </div>
          )}
        </div>

        <aside className="mt-5 flex flex-col gap-3 lg:sticky lg:top-8 lg:mt-0 lg:self-start">
          {trialContactHref && (
            <Card className="border-night-primary/35 bg-gradient-night-hero">
              <h3 className="m-0 mb-1.5 text-[15px] font-extrabold text-night-text">{t.school.trialCtaTitle}</h3>
              <p className="m-0 mb-3.5 text-[12.5px] leading-relaxed text-night-text/80">{t.school.trialCtaText}</p>
              <a
                href={trialContactHref}
                className="block w-full rounded-app-sm bg-gradient-night-cta py-2.5 text-center text-sm font-extrabold text-white no-underline hover:brightness-110"
              >
                {t.school.trialCtaButton}
              </a>
            </Card>
          )}

          <Card className="border-night-border bg-night-card">
            <h3 className="m-0 mb-2 font-night text-base font-bold text-night-text">{t.school.contacts}</h3>
            <div className="flex flex-col gap-2 text-sm">
              {school.contactPhone && (
                <a href={`tel:${school.contactPhone.replace(/[^+\d]/g, "")}`} className="flex items-center gap-2 text-night-text no-underline hover:text-night-primary">
                  <PhoneIcon />
                  {school.contactPhone}
                </a>
              )}
              {school.contactEmail && (
                <a href={`mailto:${school.contactEmail}`} className="flex items-center gap-2 text-night-text no-underline hover:text-night-primary">
                  <MailIcon />
                  {school.contactEmail}
                </a>
              )}
              {socialLinks.website && (
                <a href={socialLinks.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-night-text no-underline hover:text-night-primary">
                  🌐 {socialLinks.website}
                </a>
              )}
              {socialLinks.instagram && (
                <a href={socialLinks.instagram} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-night-text no-underline hover:text-night-primary">
                  📷 {socialLinks.instagram}
                </a>
              )}
            </div>
          </Card>

          {school.branches.length > 0 && (
            <Card className="border-night-border bg-night-card">
              <h3 className="m-0 mb-2 font-night text-base font-bold text-night-text">{t.school.branches}</h3>
              <div className="flex flex-col gap-3">
                {school.branches.map((b) => (
                  <div key={b.id} className="border-b border-night-border pb-3 text-sm last:border-0 last:pb-0">
                    <div className="flex items-start gap-2 text-night-muted">
                      <span className="mt-0.5 shrink-0 text-night-primary">
                        <PinIcon />
                      </span>
                      <span>
                        {b.address}
                        {b.city ? ` (${b.city.nameRu})` : ""}
                      </span>
                    </div>
                    {b.latitude != null && b.longitude != null ? (
                      <iframe
                        src={osmEmbedUrl(b.latitude, b.longitude)}
                        loading="lazy"
                        title={`Карта: ${b.address}`}
                        className="mt-2 aspect-video w-full rounded-app-sm border-0"
                      />
                    ) : (
                      <p className="m-0 mt-1 text-xs text-night-disabled">{t.school.mapUnavailable}</p>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
