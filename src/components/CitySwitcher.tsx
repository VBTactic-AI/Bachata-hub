"use client";

import { useRouter } from "next/navigation";
import { t } from "@/lib/i18n/dictionary";
import { Select } from "@/components/ui/field";

type City = { id: string; slug: string; nameRu: string };

export function CitySwitcher({
  cities,
  currentSlug,
}: {
  cities: City[];
  currentSlug: string | null;
}) {
  const router = useRouter();

  function onChange(slug: string) {
    document.cookie = `bachata_city=${slug}; path=/; max-age=${60 * 60 * 24 * 365}`;
    router.refresh();
  }

  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="hint-text">{t.city.change}</span>
      <Select
        className="!w-auto py-1.5"
        value={currentSlug ?? ""}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{t.city.allCities}</option>
        {cities.map((c) => (
          <option key={c.id} value={c.slug}>
            {c.nameRu}
          </option>
        ))}
      </Select>
    </label>
  );
}
