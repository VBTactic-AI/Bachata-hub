import type { Metadata } from "next";
import { t } from "@/lib/i18n/dictionary";
import { prisma } from "@/lib/prisma";
import { searchEvents } from "@/lib/events";
import { EventCard } from "@/components/EventCard";
import { pluralizeRu } from "@/lib/format";
import { Button, buttonVariants } from "@/components/ui/button";
import { FiltersForm, Input, Label, Select } from "@/components/ui/field";

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
  const [cities, schools, events] = await Promise.all([
    prisma.city.findMany({ where: { isActive: true }, orderBy: { nameRu: "asc" } }),
    prisma.school.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    searchEvents({
      citySlug: sp.city,
      format: sp.format,
      level: sp.level,
      schoolSlug: sp.school,
      dateFrom: sp.from,
      dateTo: sp.to,
    }),
  ]);

  const selectClass = "border-night-border bg-night-card text-night-text hover:border-night-primary focus:border-night-primary focus:ring-night-primary/20";

  return (
    <div className="flex flex-col gap-4">
      <h1 className="m-0 font-night text-xl font-extrabold text-night-text">{t.nav.calendar}</h1>
      <p className="m-0 -mt-2 text-sm text-night-muted">
        {events.length} {pluralizeRu(events.length, t.event.eventsFoundCount)}
      </p>

      <FiltersForm method="get" className="border-night-border bg-night-card">
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
          <Input type="date" name="from" defaultValue={sp.from ?? ""} className={selectClass} />
        </Label>
        <Label className="text-night-muted">
          {t.event.filters.dateTo}
          <Input type="date" name="to" defaultValue={sp.to ?? ""} className={selectClass} />
        </Label>
        <div className="flex gap-2">
          <Button type="submit" className="border-none bg-gradient-night-cta">
            {t.event.filters.apply}
          </Button>
          <a
            href="/events"
            className={buttonVariants({
              variant: "secondary",
              className: "border-night-border bg-transparent text-night-text no-underline hover:bg-night-card2",
            })}
          >
            {t.event.filters.reset}
          </a>
        </div>
      </FiltersForm>

      {events.length === 0 ? (
        <p className="text-sm text-night-muted">{t.home.noEventsToday}</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((e) => (
            <EventCard key={e.id} event={e} />
          ))}
        </div>
      )}
    </div>
  );
}
