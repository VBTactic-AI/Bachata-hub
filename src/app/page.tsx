import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { t } from "@/lib/i18n/dictionary";
import { getPreferredCity } from "@/lib/city-preference";
import { eventsForCalendarMonth } from "@/lib/events";
import { getLiveCompetitionSummary, getUpcomingCompetitionTeaser } from "@/lib/home-live";
import { getSchoolDiscoveryData, getDiscoveryEventGroups } from "@/lib/school-discovery";
import { EventCalendar } from "@/components/EventCalendar";
import { AmbientParticles } from "@/components/AmbientParticles";
import { ScrollReveal } from "@/components/ScrollReveal";
import { LiveDot } from "@/components/LiveDot";
import { CompetitionCard } from "@/components/compete/CompetitionCard";
import { SchoolEventsDiscovery } from "@/components/SchoolEventsDiscovery";
import { DarkTopNav } from "@/components/dark/DarkTopNav";
import { BottomNavGate } from "@/components/compete/BottomNavGate";

export default async function HomePage() {
  const preferredCity = await getPreferredCity();
  const now = new Date();
  const calendarYear = now.getFullYear();
  const calendarMonth = now.getMonth() + 1;

  const [schoolDiscovery, initialGroups, calendarEvents, liveCompetition, upcomingCompetition] = await Promise.all([
    getSchoolDiscoveryData(preferredCity?.id ?? null),
    // Начальное состояние блока "Школы → события" — карточка "Все школы"
    // активна по умолчанию (см. SchoolEventsDiscovery.tsx), поэтому здесь
    // сразу тянем "Сегодня"/"Ближайшие" для всех школ, а не делаем
    // клиентский запрос при первой отрисовке.
    getDiscoveryEventGroups(null, preferredCity?.id ?? null),
    eventsForCalendarMonth(preferredCity?.id ?? null, calendarYear, calendarMonth),
    getLiveCompetitionSummary(),
    getUpcomingCompetitionTeaser(),
  ]);

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

              <div className="relative flex max-w-[420px] flex-col gap-3">
                <span className="text-xs font-bold uppercase tracking-[0.15em] text-night-muted">{t.home.heroKicker}</span>
                <h1 className="m-0 font-night text-[1.75rem] font-extrabold leading-[1.05] tracking-tight text-night-text sm:text-4xl">
                  {t.home.heroTitleBefore}
                  <span className="text-night-primary">{t.home.heroTitleHighlight}</span>
                  {t.home.heroTitleAfter}
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

          {/* Карусель школ (слева, шире) + календарь (справа) — по раскладке
              пользователя, 2026-09-14: карусель со своими "Сегодня"/
              "Ближайшие (1 неделя)" теперь первый содержательный блок
              страницы, календарь — рядом с ней, а не отдельной секцией ниже.
              На мобильном (одна колонка) порядок наоборот — сначала календарь,
              потом карусель школ (по прямому запросу пользователя, 2026-09-15):
              order переключается только по lg:, сама раскладка (grid-cols-3,
              col-span) не меняется. */}
          <ScrollReveal delay={0.15}>
            <section className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:items-start">
              <div className="order-2 lg:order-1 lg:col-span-2">
                <SchoolEventsDiscovery data={schoolDiscovery} initialGroups={initialGroups} />
              </div>
              <div className="order-1 flex flex-col gap-3 lg:order-2">
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
                <Link href="/events" className="self-start text-sm font-semibold text-night-primary no-underline hover:no-underline">
                  {t.home.seeFullCalendar} →
                </Link>
              </div>
            </section>
          </ScrollReveal>

          {/* LIVE — ниже блока школы+календарь, во всю ширину (по раскладке
              пользователя, 2026-09-14). */}
          {(liveCompetition || upcomingCompetition) && (
            <ScrollReveal delay={0.3}>
              <section className="flex flex-col gap-3 rounded-app border border-white/10 bg-night-card/75 p-5 backdrop-blur-md sm:p-6">
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
              </section>
            </ScrollReveal>
          )}

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
