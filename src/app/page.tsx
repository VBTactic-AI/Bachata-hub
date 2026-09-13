import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { t } from "@/lib/i18n/dictionary";
import { getPreferredCity } from "@/lib/city-preference";
import { eventsForHome, eventsForCalendarMonth } from "@/lib/events";
import { getLiveCompetitionSummary, getUpcomingCompetitionTeaser, getRecentChampions } from "@/lib/home-live";
import { formatEventCardPrice } from "@/lib/event-price";
import { EVENT_FORMAT_COLOR } from "@/lib/event-format-colors";
import { EventCalendar } from "@/components/EventCalendar";
import { formatEventTime, formatRelativeDayLabel, pluralizeRu } from "@/lib/format";
import { CityPicker } from "@/components/CityPicker";
import { CardLightSweep } from "@/components/CardLightSweep";
import { AmbientParticles } from "@/components/AmbientParticles";
import { ScrollReveal } from "@/components/ScrollReveal";
import { LiveDot } from "@/components/LiveDot";
import { VerificationBadge } from "@/components/VerificationBadge";
import { CompetitionCard } from "@/components/compete/CompetitionCard";
import { prisma } from "@/lib/prisma";
import { DarkTopNav } from "@/components/dark/DarkTopNav";
import { BottomNavGate } from "@/components/compete/BottomNavGate";
import type { City, Event, EventFormat, EventPriceOption, School } from "@prisma/client";

type EventWithRelations = Event & { city: City; school: School | null; priceOptions: EventPriceOption[] };
type SchoolWithExtras = School & { city: City; _count: { teachers: number } };

// Русские подписи формата события для карточек — короткая форма
// (единственное число), в отличие от FORMAT_LABELS в SubscriptionsManager.tsx
// (там нужна форма для чекбоксов "Мастер-классы" во множественном числе) —
// разные экраны, разный грамматический контекст, отдельная небольшая карта
// не стоит выносить в общий файл ради двух строк использования.
const EVENT_FORMAT_LABEL: Record<EventFormat, string> = {
  PARTY: "Вечеринка",
  MASTERCLASS: "Мастер-класс",
  FESTIVAL: "Фестиваль",
  CONTEST: "Соревнование",
  INTENSIVE: "Интенсив",
};

// Визуальная карточка события для сетки "Сейчас в Bachata Hub" — фото,
// бейдж формата, дата/место, цена (formatEventCardPrice — уже существующая
// логика показа цены, CLAUDE.md §64: не изобретаем вторую). Не переиспользует
// светлый общий EventCard (тот обслуживает /events, остаётся светлым).
function HomeEventCard({ event, sweepDelay = 0 }: { event: EventWithRelations; sweepDelay?: number }) {
  const relativeDay = formatRelativeDayLabel(event.startsAt);
  const meta = [event.city.nameRu, event.school?.name].filter(Boolean).join(" · ");
  const price = formatEventCardPrice(event.priceText, event.priceOptions);
  const accent = EVENT_FORMAT_COLOR[event.format];

  return (
    <Link
      href={`/events/${event.slug}`}
      className="group relative flex flex-col overflow-hidden rounded-app border border-white/10 bg-night-card/75 no-underline backdrop-blur-md transition-colors hover:border-white/20 hover:bg-night-card2/85"
    >
      <div className="relative h-[132px] w-full shrink-0 overflow-hidden">
        <div
          className="h-full w-full bg-gradient-night-hero bg-cover bg-center transition-transform duration-500 ease-out group-hover:scale-110"
          style={event.photoUrl ? { backgroundImage: `url(${event.photoUrl})` } : undefined}
          aria-hidden="true"
        />
        <span
          className="absolute left-2.5 top-2.5 rounded-full px-2.5 py-1 text-[0.68rem] font-bold uppercase tracking-wide text-white"
          style={{ backgroundColor: accent }}
        >
          {EVENT_FORMAT_LABEL[event.format]}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3.5">
        <span className="line-clamp-2 text-[0.95rem] font-semibold leading-snug text-night-text">{event.title}</span>
        <span className="text-sm font-medium text-night-primary">
          {relativeDay ? `${relativeDay}, ` : ""}
          {formatEventTime(event.startsAt)}
        </span>
        {meta && <span className="truncate text-xs text-night-muted">{meta}</span>}
        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <span className="truncate text-xs font-semibold text-night-text">{price ?? ""}</span>
          <span className="shrink-0 text-xs font-semibold text-night-primary">{t.common.details} →</span>
        </div>
      </div>
      <CardLightSweep sweepDelay={sweepDelay} />
    </Link>
  );
}

// Более визуальная карточка школы для главной (по прямому запросу
// пользователя) — крупная область фото (пока плейсхолдер-градиент: School не
// хранит обложку, docs не предполагали её на этом этапе), значок
// подтверждения, реальное число преподавателей (_count.teachers) и реальные
// направления школы. Не рейтинг/выдуманная метрика популярности — та же
// витрина, что и раньше (see prisma-запрос ниже), просто крупнее и с большим
// количеством реальных полей на карточке.
function HomeSchoolCard({ school, sweepDelay = 0 }: { school: SchoolWithExtras; sweepDelay?: number }) {
  const teachersCount = school._count.teachers;

  return (
    <Link
      href={`/schools/${school.slug}`}
      className="group relative flex flex-col overflow-hidden rounded-app border border-white/10 bg-night-card/75 no-underline backdrop-blur-md transition-[transform,box-shadow,background-color,border-color] duration-300 ease-out hover:z-10 hover:scale-[1.03] hover:border-white/20 hover:bg-night-card2/85 hover:shadow-[0_25px_50px_-15px_rgba(0,0,0,0.6)]"
    >
      <div className="relative h-[128px] w-full shrink-0 overflow-hidden">
        <div
          className="h-full w-full bg-gradient-night-hero bg-cover bg-center transition-transform duration-500 ease-out group-hover:scale-110"
          aria-hidden="true"
        />
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3.5">
        <VerificationBadge status={school.verificationStatus} />
        <span className="truncate text-[0.95rem] font-semibold text-night-text">{school.name}</span>
        <span className="truncate text-xs text-night-muted">
          {school.city.nameRu}
          {teachersCount > 0 ? ` · ${teachersCount} ${pluralizeRu(teachersCount, ["преподаватель", "преподавателя", "преподавателей"])}` : ""}
        </span>
        {school.directions.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {school.directions.slice(0, 3).map((d) => (
              <span key={d} className="rounded-full bg-night-card2 px-2 py-0.5 text-[0.68rem] font-semibold text-night-pink">
                {d}
              </span>
            ))}
          </div>
        )}
      </div>
      <CardLightSweep sweepDelay={sweepDelay} />
    </Link>
  );
}

const ROLE_LABEL: Record<"LEADER" | "FOLLOWER", string> = { LEADER: "Ведущий", FOLLOWER: "Ведомая" };

export default async function HomePage() {
  const preferredCity = await getPreferredCity();
  const now = new Date();
  const calendarYear = now.getFullYear();
  const calendarMonth = now.getMonth() + 1;

  const [[today, thisWeek], cities, popularSchools, calendarEvents, liveCompetition, upcomingCompetition, recentChampions] = await Promise.all([
    eventsForHome(preferredCity?.id ?? null),
    prisma.city.findMany({ where: { isActive: true }, orderBy: { nameRu: "asc" } }),
    // Витрина, не рейтинг: без отдельной метрики популярности показываем
    // первые активные школы (подтверждённые — раньше), тот же порядок, что и
    // на /schools — не выдумываем алгоритм ранжирования для тизера.
    prisma.school.findMany({
      where: { isActive: true },
      include: { city: true, _count: { select: { teachers: true } } },
      orderBy: [{ verificationStatus: "asc" }, { name: "asc" }],
      take: 10,
    }),
    eventsForCalendarMonth(preferredCity?.id ?? null, calendarYear, calendarMonth),
    getLiveCompetitionSummary(),
    getUpcomingCompetitionTeaser(),
    getRecentChampions(5),
  ]);

  const happeningNow = [...today, ...thisWeek].slice(0, 8);
  const heroFeaturedEvent = today[0] ?? thisWeek[0] ?? null;

  return (
    <div className="relative mx-[calc(50%-50vw)] -my-6 min-h-[100dvh] bg-night-bg font-night text-night-text">
      <AmbientParticles />
      <div className="relative z-10">
        <DarkTopNav />
        <div className="flex flex-col gap-6 px-4 pb-24 pt-4 sm:mx-auto sm:max-w-[1920px] sm:px-8 sm:pb-14 sm:pt-8 xl:px-12 2xl:px-16">
          <ScrollReveal delay={0}>
            <section className="relative flex min-h-[240px] flex-col justify-end overflow-hidden rounded-app bg-gradient-night-hero p-6 sm:min-h-[360px] sm:p-10 lg:min-h-[420px]">
              {/* Фото пары — снова только в хиро-блоке (по прямому запросу
                  пользователя, 2026-09-11: убран вариант "фото на весь фон
                  страницы" из 47e5b6b — остальная часть страницы обратно на
                  сплошном bg-night-bg). bg-gradient-night-hero на самой секции —
                  фон на случай, если фото ещё не загрузилось. */}
              <Image
                src="/branding/jnj-couple.png"
                alt=""
                fill
                priority
                sizes="(min-width: 1600px) 1600px, 100vw"
                className="object-cover object-[60%_20%]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-night-bg via-night-bg/70 to-night-bg/10" aria-hidden="true" />

              {/* Мини-карточка ближайшего события (по референсу пользователя) —
                  только реальное первое событие из уже загруженных today/thisWeek,
                  ничего не выдумываем; на мобильном места мало — скрыта до sm:. */}
              {heroFeaturedEvent && (
                <Link
                  href={`/events/${heroFeaturedEvent.slug}`}
                  className="absolute right-6 top-6 hidden w-[260px] flex-col gap-1.5 rounded-app border border-white/10 bg-night-card/80 p-4 no-underline backdrop-blur-md transition-colors hover:border-white/20 hover:bg-night-card2/85 sm:flex lg:right-10 lg:top-10"
                >
                  <span className="text-[0.68rem] font-bold uppercase tracking-wide text-night-muted">{t.home.heroNearestLabel}</span>
                  <span className="line-clamp-2 font-night text-[0.95rem] font-bold leading-snug text-night-text">{heroFeaturedEvent.title}</span>
                  <span className="text-sm font-semibold text-night-primary">
                    {formatRelativeDayLabel(heroFeaturedEvent.startsAt) ? `${formatRelativeDayLabel(heroFeaturedEvent.startsAt)}, ` : ""}
                    {formatEventTime(heroFeaturedEvent.startsAt)}
                  </span>
                  <span className="truncate text-xs text-night-muted">{heroFeaturedEvent.city.nameRu}</span>
                </Link>
              )}

              <div className="relative flex max-w-[420px] flex-col gap-3">
                <h1 className="m-0 font-night text-[1.75rem] font-extrabold leading-[1.05] tracking-tight text-night-text sm:text-4xl">
                  {t.home.heroTitle}
                </h1>
                <p className="m-0 max-w-[280px] text-sm leading-relaxed text-night-muted sm:max-w-none">{t.home.heroSubtitle}</p>
                <div className="mt-1 flex flex-wrap gap-3">
                  <Link
                    href="/events"
                    className="self-start rounded-full bg-gradient-night-cta px-6 py-3 text-xs font-bold uppercase tracking-wide text-white no-underline hover:no-underline"
                  >
                    {t.home.heroCta}
                  </Link>
                  <Link
                    href="/compete"
                    className="self-start rounded-full border border-white/20 bg-white/5 px-6 py-3 text-xs font-bold uppercase tracking-wide text-night-text no-underline backdrop-blur-md hover:border-white/40 hover:no-underline"
                  >
                    {t.home.heroCtaSecondary}
                  </Link>
                </div>
              </div>
            </section>
          </ScrollReveal>

          {!preferredCity && (
            <ScrollReveal delay={0.1}>
              <section className="rounded-app bg-night-card p-4">
                <p className="m-0 mb-3 text-sm text-night-muted">{t.city.choose}:</p>
                <CityPicker cities={cities} />
                <p className="m-0 mt-3 text-xs text-night-muted">{t.city.switchHint}</p>
              </section>
            </ScrollReveal>
          )}

          <ScrollReveal delay={0.2}>
            <section className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <h2 className="m-0 font-night text-lg font-bold text-night-text sm:text-xl">{t.home.happeningNow}</h2>
                  <p className="m-0 mt-0.5 text-sm text-night-muted">{t.home.happeningNowSubtitle}</p>
                </div>
                <Link href="/events" className="shrink-0 text-sm font-semibold text-night-primary no-underline hover:no-underline">
                  {t.home.seeAllEvents} →
                </Link>
              </div>
              {happeningNow.length === 0 ? (
                <p className="m-0 text-sm text-night-muted">{t.home.noEventsToday}</p>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                  {happeningNow.map((e, i) => (
                    <HomeEventCard key={e.id} event={e} sweepDelay={(i % 5) * 0.5} />
                  ))}
                </div>
              )}
            </section>
          </ScrollReveal>

          {(liveCompetition || upcomingCompetition || recentChampions.length > 0) && (
            <ScrollReveal delay={0.3}>
              <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="flex flex-col gap-3 rounded-app border border-white/10 bg-night-card/75 p-5 backdrop-blur-md sm:p-6 lg:col-span-2">
                  {liveCompetition ? (
                    <>
                      <div className="flex items-center gap-2">
                        <LiveDot />
                        <span className="text-xs font-bold uppercase tracking-wide text-night-success">LIVE</span>
                      </div>
                      <h3 className="m-0 font-night text-lg font-bold text-night-text sm:text-xl">{liveCompetition.name}</h3>
                      {liveCompetition.currentStageLabel && (
                        <p className="m-0 text-sm font-semibold text-night-primary">
                          {liveCompetition.currentStageLabel}
                          {liveCompetition.heatNumber ? ` · Заезд ${liveCompetition.heatNumber}` : ""}
                          {liveCompetition.categoryName ? ` · ${liveCompetition.categoryName}` : ""}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-night-muted">
                        <span>
                          {liveCompetition.leadersCount} {t.home.liveStatLeaders}
                        </span>
                        <span>
                          {liveCompetition.followersCount} {t.home.liveStatFollowers}
                        </span>
                        <span>
                          {liveCompetition.divisionsCount} {t.home.liveStatDivisions}
                        </span>
                      </div>
                      <Link
                        href={`/compete/${liveCompetition.id}`}
                        className="mt-1 self-start rounded-full bg-gradient-night-cta px-5 py-2.5 text-xs font-bold uppercase tracking-wide text-white no-underline hover:no-underline"
                      >
                        {t.home.liveWatch} →
                      </Link>
                    </>
                  ) : upcomingCompetition ? (
                    <>
                      <span className="text-xs font-bold uppercase tracking-wide text-night-muted">{t.home.liveUpcomingLabel}</span>
                      <CompetitionCard competition={upcomingCompetition} />
                    </>
                  ) : null}
                </div>

                <div className="flex flex-col gap-3 rounded-app border border-white/10 bg-night-card/75 p-5 backdrop-blur-md sm:p-6">
                  <h3 className="m-0 font-night text-base font-bold text-night-text">{t.home.recentChampions}</h3>
                  {recentChampions.length === 0 ? (
                    <p className="m-0 text-sm text-night-muted">{t.home.recentChampionsEmpty}</p>
                  ) : (
                    <ul className="m-0 flex list-none flex-col gap-3 p-0">
                      {recentChampions.map((c) => (
                        <li key={c.resultId}>
                          <Link
                            href={`/compete/${c.competitionId}`}
                            className="flex items-center gap-2.5 no-underline hover:no-underline"
                          >
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-night-cta text-sm font-extrabold text-white">
                              1
                            </span>
                            <span className="flex min-w-0 flex-col">
                              <span className="truncate text-sm font-semibold text-night-text">{c.dancerName}</span>
                              <span className="truncate text-xs text-night-muted">
                                {ROLE_LABEL[c.role]} · {c.categoryName} · {c.competitionName}
                              </span>
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            </ScrollReveal>
          )}

          <ScrollReveal delay={0.4}>
            <section className="flex flex-col gap-3">
              <h2 className="m-0 font-night text-lg font-bold text-night-text">{t.nav.calendar}</h2>
              <EventCalendar
                initialYear={calendarYear}
                initialMonth={calendarMonth}
                initialEvents={calendarEvents.map((e) => ({
                  id: e.id,
                  slug: e.slug,
                  title: e.title,
                  format: e.format,
                  startsAt: e.startsAt.toISOString(),
                  cityName: e.cityName,
                  schoolName: e.schoolName,
                }))}
                cityId={preferredCity?.id ?? null}
              />
            </section>
          </ScrollReveal>

          <Link href="/events" className="self-start text-sm font-semibold text-night-primary no-underline hover:no-underline">
            {t.home.seeFullCalendar} →
          </Link>

          {popularSchools.length > 0 && (
            <ScrollReveal delay={0.5}>
              <section className="flex flex-col gap-3">
                <div className="flex items-baseline justify-between gap-3">
                  <div>
                    <h2 className="m-0 font-night text-lg font-bold text-night-text sm:text-xl">{t.home.popularSchools}</h2>
                    <p className="m-0 mt-0.5 text-sm text-night-muted">{t.home.popularSchoolsSubtitle}</p>
                  </div>
                  <Link href="/schools" className="shrink-0 text-sm font-semibold text-night-primary no-underline hover:no-underline">
                    {t.home.seeAllSchools}
                  </Link>
                </div>
                <div className="grid grid-flow-col auto-cols-[168px] grid-rows-1 gap-3 overflow-x-auto pb-1 sm:grid-flow-row sm:auto-cols-auto sm:grid-cols-2 sm:overflow-visible lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                  {popularSchools.map((s, i) => (
                    <HomeSchoolCard key={s.id} school={s} sweepDelay={(i % 5) * 0.5} />
                  ))}
                </div>
              </section>
            </ScrollReveal>
          )}

          <ScrollReveal delay={0.6}>
            <section className="relative flex flex-col gap-4 overflow-hidden rounded-app bg-gradient-night-hero p-6 sm:flex-row sm:items-center sm:justify-between sm:p-10">
              <div className="relative flex max-w-[480px] flex-col gap-2">
                <h2 className="m-0 font-night text-xl font-extrabold leading-tight text-night-text sm:text-2xl">{t.home.organizerTitle}</h2>
                <p className="m-0 text-sm leading-relaxed text-night-muted">{t.home.organizerSubtitle}</p>
              </div>
              <Link
                href="/admin/competitions/new"
                className="relative self-start rounded-full bg-gradient-night-cta px-6 py-3 text-xs font-bold uppercase tracking-wide text-white no-underline hover:no-underline sm:self-center"
              >
                {t.home.organizerCta} →
              </Link>
            </section>
          </ScrollReveal>

          <footer className="mt-6 flex flex-col gap-6 border-t border-night-border pt-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-col gap-1.5">
              <span className="font-night text-base font-bold text-night-primary">{t.common.siteName}</span>
              <span className="text-sm text-night-muted">{t.home.footerTagline}</span>
            </div>
            <div className="flex flex-wrap gap-x-10 gap-y-4">
              <div className="flex flex-col gap-2">
                <span className="text-xs font-bold uppercase tracking-wide text-night-disabled">{t.home.footerNav}</span>
                <Link href="/events" className="text-sm text-night-muted no-underline hover:text-night-text hover:no-underline">
                  {t.nav.calendar}
                </Link>
                <Link href="/compete" className="text-sm text-night-muted no-underline hover:text-night-text hover:no-underline">
                  {t.nav.competitions}
                </Link>
                <Link href="/schools" className="text-sm text-night-muted no-underline hover:text-night-text hover:no-underline">
                  {t.nav.schools}
                </Link>
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-xs font-bold uppercase tracking-wide text-night-disabled">{t.home.footerAccount}</span>
                <Link href="/profile" className="text-sm text-night-muted no-underline hover:text-night-text hover:no-underline">
                  {t.nav.profile}
                </Link>
                <Link href="/login" className="text-sm text-night-muted no-underline hover:text-night-text hover:no-underline">
                  {t.nav.login}
                </Link>
              </div>
            </div>
          </footer>
          <p className="m-0 text-xs text-night-disabled">
            © {now.getFullYear()} {t.common.siteName}
          </p>
        </div>
        <Suspense fallback={null}>
          <div className="sm:hidden">
            <BottomNavGate />
          </div>
        </Suspense>
      </div>
    </div>
  );
}
