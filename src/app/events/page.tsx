import type { Metadata } from "next";
import { t } from "@/lib/i18n/dictionary";
import { prisma } from "@/lib/prisma";
import { searchEvents } from "@/lib/events";
import { getCurrentUser } from "@/lib/auth";
import { getSubscriptionIdMap } from "@/server/notifications/subscriptions";
import { EventCard } from "@/components/EventCard";
import { FollowButton } from "@/components/notifications/FollowButton";
import { pluralizeRu } from "@/lib/format";
import { Button, buttonVariants } from "@/components/ui/button";
import { FiltersForm, Input, Label, Select } from "@/components/ui/field";
import { DateFilterField } from "@/components/ui/DateFilterField";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  title: t.nav.calendar,
  description: t.meta.eventsDescription,
};

// Публичная страница отдаёт готовый HTML без обязательного JS для контента —
// фильтры работают через обычный GET-запрос формы (searchParams), поэтому
// страница остаётся индексируемой и рабочей даже без клиентского JS.
export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const [cities, schools, events, user] = await Promise.all([
    prisma.city.findMany({ where: { isActive: true }, orderBy: { nameRu: "asc" } }),
    prisma.school.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    searchEvents({
      citySlug: sp.city,
      format: sp.format,
      level: sp.level,
      schoolSlug: sp.school,
      dateFrom: sp.from,
      dateTo: sp.to,
      query: sp.q,
    }),
    getCurrentUser(),
  ]);

  // Избранное на карточках (2026-09-19) — переиспользует Notification &
  // Subscription Engine (type=EVENT), батч-запрос вместо одного на карточку.
  const favoriteIdByEventId = user ? await getSubscriptionIdMap(user.id, "EVENT", events.map((e) => e.id)) : new Map<string, string>();

  // "Уведомлять о новых событиях" — контекстная подписка на активный фильтр
  // (город и/или формат), а не отдельный самостоятельный переключатель: это
  // и есть тот же Subscription Engine (type=CITY/EVENT_TYPE), просто без
  // выдумывания нового понятия "уведомления" рядом с уже существующим follow.
  const selectedCity = sp.city ? cities.find((c) => c.slug === sp.city) : undefined;
  const [citySubscription, formatSubscription] = await Promise.all([
    user && selectedCity ? prisma.subscription.findUnique({ where: { userId_type_targetId: { userId: user.id, type: "CITY", targetId: selectedCity.id } } }) : null,
    user && sp.format ? prisma.subscription.findUnique({ where: { userId_type_targetId: { userId: user.id, type: "EVENT_TYPE", targetId: sp.format } } }) : null,
  ]);

  const selectClass = "rounded-full border-night-border bg-night-card px-4 text-night-text hover:border-night-primary focus:border-night-primary focus:ring-night-primary/20";

  return (
    <div className="flex flex-col gap-4">
      <h1 className="m-0 font-night text-xl font-extrabold text-night-text">{t.nav.calendar}</h1>
      <p className="m-0 -mt-2 text-sm text-night-muted">
        {events.length} {pluralizeRu(events.length, t.event.eventsFoundCount)}
      </p>

      <FiltersForm method="get" className="border-night-border bg-night-card">
        <Label className="text-night-muted">
          Поиск
          <Input
            type="search"
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Название, школа…"
            className={cn(selectClass, "bg-night-card2")}
          />
        </Label>
        <Label className="text-night-muted">
          {t.event.filters.city}
          <Select name="city" defaultValue={sp.city ?? ""} className={selectClass}>
            <option value="">{t.common.all}</option>
            {cities.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.nameRu}
              </option>
            ))}
          </Select>
        </Label>
        <Label className="text-night-muted">
          {t.event.filters.format}
          <Select name="format" defaultValue={sp.format ?? ""} className={selectClass}>
            <option value="">{t.common.all}</option>
            {Object.entries(t.event.formats).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </Label>
        <Label className="text-night-muted">
          {t.event.filters.level}
          <Select name="level" defaultValue={sp.level ?? ""} className={selectClass}>
            <option value="">{t.common.all}</option>
            {Object.entries(t.event.levels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </Label>
        <Label className="text-night-muted">
          {t.event.filters.school}
          <Select name="school" defaultValue={sp.school ?? ""} className={selectClass}>
            <option value="">{t.common.all}</option>
            {schools.map((s) => (
              <option key={s.id} value={s.slug}>
                {s.name}
              </option>
            ))}
          </Select>
        </Label>
        <Label className="text-night-muted">
          {t.event.filters.dateFrom}
          <DateFilterField name="from" defaultValue={sp.from ?? ""} theme="night" className={selectClass} />
        </Label>
        <Label className="text-night-muted">
          {t.event.filters.dateTo}
          <DateFilterField name="to" defaultValue={sp.to ?? ""} theme="night" className={selectClass} />
        </Label>
        <div className="flex gap-2">
          <Button type="submit" className="border-none bg-gradient-night-cta">
            {t.event.filters.apply}
          </Button>
          <a
            href="/events"
            className={cn(
              buttonVariants({ variant: "secondary" }),
              "border-night-border bg-transparent text-night-text no-underline hover:bg-night-card2"
            )}
          >
            {t.event.filters.reset}
          </a>
        </div>
      </FiltersForm>

      {(selectedCity || sp.format) && (
        <div className="-mt-2 flex flex-wrap gap-2">
          {selectedCity && (
            <FollowButton
              type="CITY"
              targetId={selectedCity.id}
              loggedIn={!!user}
              initialSubscriptionId={citySubscription?.id ?? null}
              labelFollow={`Уведомлять о новых событиях: ${selectedCity.nameRu}`}
              labelFollowing={`Подписан: ${selectedCity.nameRu}`}
              className="border border-night-border bg-transparent text-night-text hover:border-night-primary"
            />
          )}
          {sp.format && (
            <FollowButton
              type="EVENT_TYPE"
              targetId={sp.format}
              loggedIn={!!user}
              initialSubscriptionId={formatSubscription?.id ?? null}
              labelFollow={`Уведомлять о новых событиях: ${t.event.formats[sp.format as keyof typeof t.event.formats] ?? sp.format}`}
              labelFollowing={`Подписан: ${t.event.formats[sp.format as keyof typeof t.event.formats] ?? sp.format}`}
              className="border border-night-border bg-transparent text-night-text hover:border-night-primary"
            />
          )}
        </div>
      )}

      {events.length === 0 ? (
        <p className="text-sm text-night-muted">{t.home.noEventsToday}</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {events.map((e) => (
            <EventCard key={e.id} event={e} loggedIn={!!user} favoriteSubscriptionId={favoriteIdByEventId.get(e.id) ?? null} />
          ))}
        </div>
      )}
    </div>
  );
}
