import type { Metadata } from "next";
import { t } from "@/lib/i18n/dictionary";
import { prisma } from "@/lib/prisma";
import { searchEvents } from "@/lib/events";
import { EventCard } from "@/components/EventCard";
import { pluralizeRu } from "@/lib/format";

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

  return (
    <div>
      <h1 className="page-title">{t.nav.calendar}</h1>
      <p className="page-subtitle">
        {events.length} {pluralizeRu(events.length, t.event.eventsFoundCount)}
      </p>

      <form className="filters-form" method="get">
        <label>
          {t.event.filters.city}
          <select name="city" defaultValue={sp.city ?? ""}>
            <option value="">{t.common.all}</option>
            {cities.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.nameRu}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t.event.filters.format}
          <select name="format" defaultValue={sp.format ?? ""}>
            <option value="">{t.common.all}</option>
            {Object.entries(t.event.formats).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t.event.filters.level}
          <select name="level" defaultValue={sp.level ?? ""}>
            <option value="">{t.common.all}</option>
            {Object.entries(t.event.levels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t.event.filters.school}
          <select name="school" defaultValue={sp.school ?? ""}>
            <option value="">{t.common.all}</option>
            {schools.map((s) => (
              <option key={s.id} value={s.slug}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t.event.filters.dateFrom}
          <input type="date" name="from" defaultValue={sp.from ?? ""} />
        </label>
        <label>
          {t.event.filters.dateTo}
          <input type="date" name="to" defaultValue={sp.to ?? ""} />
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" type="submit">
            {t.event.filters.apply}
          </button>
          <a className="btn btn-secondary" href="/events">
            {t.event.filters.reset}
          </a>
        </div>
      </form>

      {events.length === 0 ? (
        <p className="hint-text">{t.home.noEventsToday}</p>
      ) : (
        <div className="card-grid">
          {events.map((e) => (
            <EventCard key={e.id} event={e} />
          ))}
        </div>
      )}
    </div>
  );
}
