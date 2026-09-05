"use client";

import { useState } from "react";

// "Скрытые (N)" — сворачиваемый блок неактивных категорий/этапов (по
// референсу пользователя, 07.09.2026), чтобы они не мешали активному списку,
// но оставались на виду по клику, а не терялись.
export function HiddenSection({ count, children }: { count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  if (count === 0) return null;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-full border border-night-border px-4 py-2 text-sm font-semibold text-night-muted hover:border-night-primary/60 hover:text-night-text"
      >
        Скрытые ({count}) {open ? "▲" : "▼"}
      </button>
      {open && <div className="mt-3 flex flex-col gap-2">{children}</div>}
    </div>
  );
}
