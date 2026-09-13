"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { t } from "@/lib/i18n/dictionary";

type City = { id: string; slug: string; nameRu: string };

// Компактный пиколотор города в шапке (по референсу пользователя) — та же
// cookie-логика, что и у CityPicker.tsx (главная, до этого показывала выбор
// города отдельным блоком под hero), просто в виде выпадающей пилюли, а не
// ряда тегов. Отдельный маленький client-компонент, потому что DarkTopNav —
// server component (CLAUDE.md §54: не переписываем существующий CityPicker,
// у него другой визуальный контекст — ряд тегов на весь блок).
export function CityHeaderPicker({ cities, currentName }: { cities: City[]; currentName: string | null }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function pick(slug: string) {
    document.cookie = `bachata_city=${slug}; path=/; max-age=${60 * 60 * 24 * 365}`;
    setOpen(false);
    router.refresh();
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-night-border bg-white/5 px-3 py-2 text-[0.8rem] font-medium text-night-text hover:border-night-primary/60 lg:px-4 lg:text-sm"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12Z" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="12" cy="9" r="2.5" />
        </svg>
        {currentName ?? t.city.allCities}
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-44 overflow-hidden rounded-app-sm border border-night-border bg-night-card2 py-1 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.6)]">
          {cities.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => pick(c.slug)}
              className="block w-full cursor-pointer border-none bg-transparent px-4 py-2 text-left font-night text-sm text-night-text hover:bg-night-card"
            >
              {c.nameRu}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
