import Link from "next/link";
import { t } from "@/lib/i18n/dictionary";
import { getPreferredCity } from "@/lib/city-preference";
import { eventsForHome } from "@/lib/events";
import { EventCard } from "@/components/EventCard";
import { CityPicker } from "@/components/CityPicker";
import { prisma } from "@/lib/prisma";

export default async function HomePage() {
  const preferredCity = await getPreferredCity();
  const [today, thisWeek] = await eventsForHome(preferredCity?.id ?? null);

  const cities = await prisma.city.findMany({
    where: { isActive: true },
    orderBy: { nameRu: "asc" },
  });

  return (
    <div className="stack">
      {!preferredCity && (
        <section className="card">
          <p style={{ margin: "0 0 12px" }}>{t.city.choose}:</p>
          <CityPicker cities={cities} />
          <p className="hint-text" style={{ marginTop: 12 }}>
            {t.city.switchHint}
          </p>
        </section>
      )}

      <section>
        <h2 className="page-title">{t.home.today}</h2>
        {today.length === 0 ? (
          <p className="hint-text">{t.home.noEventsToday}</p>
        ) : (
          <div className="card-grid">
            {today.map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="page-title">{t.home.thisWeek}</h2>
        {thisWeek.length === 0 ? (
          <p className="hint-text">{t.home.noEventsToday}</p>
        ) : (
          <div className="card-grid">
            {thisWeek.map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
          </div>
        )}
      </section>

      <Link href="/events" className="btn-secondary" style={{ alignSelf: "flex-start" }}>
        {t.home.seeFullCalendar} →
      </Link>
    </div>
  );
}
