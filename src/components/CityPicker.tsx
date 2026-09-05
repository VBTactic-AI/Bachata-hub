"use client";

import { useRouter } from "next/navigation";
import { TagButton } from "@/components/ui/tag";

type City = { id: string; slug: string; nameRu: string };

export function CityPicker({ cities }: { cities: City[] }) {
  const router = useRouter();

  function pick(slug: string) {
    document.cookie = `bachata_city=${slug}; path=/; max-age=${60 * 60 * 24 * 365}`;
    router.refresh();
  }

  return (
    <div className="flex flex-wrap gap-2">
      {cities.map((c) => (
        <TagButton
          key={c.id}
          onClick={() => pick(c.slug)}
          className="bg-night-card2 text-night-pink hover:bg-night-card2"
        >
          {c.nameRu}
        </TagButton>
      ))}
    </div>
  );
}
