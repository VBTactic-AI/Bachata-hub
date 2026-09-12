import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { t } from "@/lib/i18n/dictionary";
import { getPreferredCity } from "@/lib/city-preference";
import { eventsForHome, eventsForCalendarMonth } from "@/lib/events";
import { EventCalendar } from "@/components/EventCalendar";
import { formatEventTime, formatRelativeDayLabel } from "@/lib/format";
import { CityPicker } from "@/components/CityPicker";
import { CardLightSweep } from "@/components/CardLightSweep";
import { AmbientParticles } from "@/components/AmbientParticles";
import { ScrollReveal } from "@/components/ScrollReveal";
import { prisma } from "@/lib/prisma";
import { DarkTopNav } from "@/components/dark/DarkTopNav";
import { BottomNavGate } from "@/components/compete/BottomNavGate";
import type { City, Event, School } from "@prisma/client";

type EventWithRelations = Event & { city: City; school: School | null };

// Компактная строка события в стиле макета JBJ Platform (экран "ГЛАВНАЯ") —
// не переиспользует общий (светлый) EventCard: он общий с /events, который
// пока остаётся светлым (06.09.2026).
function HomeEventRow({ event, sweepDelay = 0 }: { event: EventWithRelations; sweepDelay?: number }) {
  const relativeDay = formatRelativeDayLabel(event.startsAt);
  const meta = [event.city.nameRu, event.school?.name].filter(Boolean).join(" · ");

  return (
    <Link
      href={`/events/${event.slug}`}
      className="relative flex items-center gap-3.5 overflow-hidden rounded-app border border-white/10 bg-night-card/75 p-3 no-underline backdrop-blur-md transition-colors hover:border-white/20 hover:bg-night-card2/85"
    >
      <span
        className="h-[68px] w-[68px] shrink-0 rounded-app-sm bg-gradient-night-hero bg-cover bg-center"
        style={event.photoUrl ? { backgroundImage: `url(${event.photoUrl})` } : undefined}
        aria-hidden="true"
      />
      <span className="flex min-w-0 flex-col gap-1">
        <span className="truncate text-[0.95rem] font-semibold text-night-text">{event.title}</span>
        <span className="text-sm font-medium text-night-primary">
          {relativeDay ? `${relativeDay}, ` : ""}
          {formatEventTime(event.startsAt)}
        </span>
        {meta && <span className="truncate text-xs text-night-muted">{meta}</span>}
      </span>
      <CardLightSweep sweepDelay={sweepDelay} />
    </Link>
  );
}

// Тизер школы для горизонтальной ленты "Популярные школы" — своя (не
// SchoolCard: тот вёрстан строкой для списка /schools, здесь нужна узкая
// вертикальная карточка, как в макете).
function HomeSchoolTeaser({ school, sweepDelay = 0 }: { school: School & { city: City }; sweepDelay?: number }) {
  return (
    <Link
      href={`/schools/${school.slug}`}
      className="group relative flex w-[132px] shrink-0 flex-col overflow-hidden rounded-app border border-white/10 bg-night-card/75 pb-3 no-underline backdrop-blur-md transition-[transform,box-shadow,background-color,border-color] duration-300 ease-out hover:z-10 hover:scale-[1.05] hover:border-white/20 hover:bg-night-card2/85 hover:shadow-[0_25px_50px_-15px_rgba(0,0,0,0.6)]"
    >
      <span
        className="block h-[92px] bg-gradient-night-hero transition-transform duration-500 ease-out group-hover:scale-110"
        aria-hidden="true"
      />
      <span className="mt-2.5 truncate px-3 text-[0.85rem] font-semibold text-night-text">{school.name}</span>
      <span className="mt-0.5 truncate px-3 text-xs text-night-muted">{school.city.nameRu}</span>
      <CardLightSweep sweepDelay={sweepDelay} />
    </Link>
  );
}

export default async function HomePage() {
  const preferredCity = await getPreferredCity();
  const now = new Date();
  const calendarYear = now.getFullYear();
  const calendarMonth = now.getMonth() + 1;

  const [[today, thisWeek], cities, popularSchools, calendarEvents] = await Promise.all([
    eventsForHome(preferredCity?.id ?? null),
    prisma.city.findMany({ where: { isActive: true }, orderBy: { nameRu: "asc" } }),
    // Витрина, не рейтинг: без отдельной метрики популярности показываем
    // первые активные школы (подтверждённые — раньше), тот же порядок, что и
    // на /schools — не выдумываем алгоритм ранжирования для тизера.
    prisma.school.findMany({
      where: { isActive: true },
      include: { city: true },
      orderBy: [{ verificationStatus: "asc" }, { name: "asc" }],
      take: 6,
    }),
    eventsForCalendarMonth(preferredCity?.id ?? null, calendarYear, calendarMonth),
  ]);

  return (
    <div className="relative mx-[calc(50%-50vw)] -my-6 min-h-[100dvh] bg-night-bg font-night text-night-text">
      <AmbientParticles />
      <div className="relative z-10">
        <DarkTopNav />
        <div className="flex flex-col gap-6 px-4 pb-24 pt-4 sm:mx-auto sm:max-w-[1240px] sm:px-8 sm:pb-12 sm:pt-8">
          <ScrollReveal delay={0}>
            <section className="relative flex min-h-[240px] flex-col justify-end overflow-hidden rounded-app bg-gradient-night-hero p-6 sm:min-h-[320px] sm:p-10">
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
                sizes="(min-width: 640px) 1240px, 100vw"
                className="object-cover object-[60%_20%]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-night-bg via-night-bg/70 to-night-bg/10" aria-hidden="true" />
              <div className="relative flex max-w-[420px] flex-col gap-3">
                <h1 className="m-0 font-night text-[1.75rem] font-extrabold leading-[1.05] tracking-tight text-night-text sm:text-4xl">
                  {t.home.heroTitle}
                </h1>
                <p className="m-0 max-w-[280px] text-sm leading-relaxed text-night-muted sm:max-w-none">{t.home.heroSubtitle}</p>
                <Link
                  href="/events"
                  className="mt-1 self-start rounded-full bg-gradient-night-cta px-6 py-3 text-xs font-bold uppercase tracking-wide text-white no-underline hover:no-underline"
                >
                  {t.home.heroCta}
                </Link>
              </div>
            </section>
          </ScrollReveal>

          {!preferredCity && (
            <ScrollReveal delay={0.2}>
              <section className="rounded-app bg-night-card p-4">
                <p className="m-0 mb-3 text-sm text-night-muted">{t.city.choose}:</p>
                <CityPicker cities={cities} />
                <p className="m-0 mt-3 text-xs text-night-muted">{t.city.switchHint}</p>
              </section>
            </ScrollReveal>
          )}

          <ScrollReveal delay={0.4}>
            <section className="flex flex-col gap-3">
              <h2 className="m-0 font-night text-lg font-bold text-night-text">{t.home.today}</h2>
              {today.length === 0 ? (
                <p className="m-0 text-sm text-night-muted">{t.home.noEventsToday}</p>
              ) : (
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {today.map((e, i) => (
                    <HomeEventRow key={e.id} event={e} sweepDelay={(i % 5) * 0.5} />
                  ))}
                </div>
              )}
            </section>
          </ScrollReveal>

          <ScrollReveal delay={0.6}>
            <section className="flex flex-col gap-3">
              <h2 className="m-0 font-night text-lg font-bold text-night-text">{t.home.thisWeek}</h2>
              {thisWeek.length === 0 ? (
                <p className="m-0 text-sm text-night-muted">{t.home.noEventsToday}</p>
              ) : (
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {thisWeek.map((e, i) => (
                    <HomeEventRow key={e.id} event={e} sweepDelay={(i % 5) * 0.5} />
                  ))}
                </div>
              )}
            </section>
          </ScrollReveal>

          <ScrollReveal delay={0.7}>
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
            <ScrollReveal delay={0.8}>
              <section className="flex flex-col gap-3">
                <div className="flex items-baseline justify-between">
                  <h2 className="m-0 font-night text-lg font-bold text-night-text">{t.home.popularSchools}</h2>
                  <Link href="/schools" className="text-sm font-semibold text-night-primary no-underline hover:no-underline">
                    {t.home.seeAllSchools}
                  </Link>
                </div>
                <div className="flex gap-3 overflow-x-auto pb-1">
                  {popularSchools.map((s, i) => (
                    <HomeSchoolTeaser key={s.id} school={s} sweepDelay={(i % 5) * 0.5} />
                  ))}
                </div>
              </section>
            </ScrollReveal>
          )}
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
