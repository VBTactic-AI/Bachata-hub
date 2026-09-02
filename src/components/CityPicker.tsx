"use client";

import { useRouter } from "next/navigation";

type City = { id: string; slug: string; nameRu: string };

export function CityPicker({ cities }: { cities: City[] }) {
  const router = useRouter();

  function pick(slug: string) {
    document.cookie = `bachata_city=${slug}; path=/; max-age=${60 * 60 * 24 * 365}`;
    router.refresh();
  }

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {cities.map((c) => (
        <button
          key={c.id}
          type="button"
          className="tag"
          style={{ padding: "6px 14px", border: "none", cursor: "pointer", font: "inherit" }}
          onClick={() => pick(c.slug)}
        >
          {c.nameRu}
        </button>
      ))}
    </div>
  );
}
