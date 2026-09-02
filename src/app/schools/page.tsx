import type { Metadata } from "next";
import type { DanceLevel } from "@prisma/client";
import { t } from "@/lib/i18n/dictionary";
import { prisma } from "@/lib/prisma";
import { SchoolCard } from "@/components/SchoolCard";
import { pluralizeRu } from "@/lib/format";

export const metadata: Metadata = {
  title: t.nav.schools,
  description: t.meta.schoolsDescription,
};

export default async function SchoolsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const [cities, schools] = await Promise.all([
    prisma.city.findMany({ where: { isActive: true }, orderBy: { nameRu: "asc" } }),
    prisma.school.findMany({
      where: {
        isActive: true,
        ...(sp.city ? { city: { slug: sp.city } } : {}),
        ...(sp.level ? { levels: { has: sp.level as DanceLevel } } : {}),
      },
      include: { city: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div>
      <h1 className="page-title">{t.nav.schools}</h1>
      <p className="page-subtitle">
        {schools.length} {pluralizeRu(schools.length, t.school.schoolsFoundCount)}
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
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" type="submit">
            {t.event.filters.apply}
          </button>
          <a className="btn btn-secondary" href="/schools">
            {t.event.filters.reset}
          </a>
        </div>
      </form>

      {schools.length === 0 ? (
        <p className="hint-text">{t.school.noSchoolsFound}</p>
      ) : (
        <div className="card-grid">
          {schools.map((s) => (
            <SchoolCard key={s.id} school={s} />
          ))}
        </div>
      )}
    </div>
  );
}
