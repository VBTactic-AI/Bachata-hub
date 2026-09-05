import type { Metadata } from "next";
import type { DanceLevel } from "@prisma/client";
import { t } from "@/lib/i18n/dictionary";
import { prisma } from "@/lib/prisma";
import { SchoolCard } from "@/components/SchoolCard";
import { pluralizeRu } from "@/lib/format";
import { Button, buttonVariants } from "@/components/ui/button";
import { FiltersForm, Label, Select } from "@/components/ui/field";

// Тёмные переопределения светлых токенов ui/field и ui/button (файлы не
// трогаем — они общие с остальным светлым сайтом, CLAUDE.md §54). tailwind-
// merge из cn() гарантирует, что эти классы победят конфликтующие светлые.
const DARK_SELECT = "border-night-border bg-night-card text-night-text hover:border-night-primary focus:border-night-primary focus:ring-night-primary/20";
const DARK_LABEL = "text-night-muted";

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
    <div className="flex flex-col gap-4">
      <h1 className="m-0 font-night text-xl font-extrabold text-night-text">{t.nav.schools}</h1>
      <p className="m-0 -mt-2 text-sm text-night-muted">
        {schools.length} {pluralizeRu(schools.length, t.school.schoolsFoundCount)}
      </p>

      <FiltersForm method="get" className="border-night-border bg-night-card">
        <Label className={DARK_LABEL}>
          {t.event.filters.city}
          <Select name="city" defaultValue={sp.city ?? ""} className={DARK_SELECT}>
            <option value="">{t.common.all}</option>
            {cities.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.nameRu}
              </option>
            ))}
          </Select>
        </Label>
        <Label className={DARK_LABEL}>
          {t.event.filters.level}
          <Select name="level" defaultValue={sp.level ?? ""} className={DARK_SELECT}>
            <option value="">{t.common.all}</option>
            {Object.entries(t.event.levels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </Label>
        <div className="flex gap-2">
          <Button type="submit" className="border-none bg-gradient-night-cta">
            {t.event.filters.apply}
          </Button>
          <a
            href="/schools"
            className={buttonVariants({
              variant: "secondary",
              className: "border-night-border bg-transparent text-night-text no-underline hover:bg-night-card2",
            })}
          >
            {t.event.filters.reset}
          </a>
        </div>
      </FiltersForm>

      {schools.length === 0 ? (
        <p className="text-sm text-night-muted">{t.school.noSchoolsFound}</p>
      ) : (
        <div className="flex flex-col gap-2.5 sm:grid sm:grid-cols-2 sm:gap-3 lg:grid-cols-3">
          {schools.map((s) => (
            <SchoolCard key={s.id} school={s} />
          ))}
        </div>
      )}
    </div>
  );
}
