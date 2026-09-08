"use client";

import { useState } from "react";

// "+ Добавить" — форма создания скрыта за кнопкой, а не всегда видна внизу
// списка (по референсу пользователя, 07.09.2026).
export function AddButton({
  label,
  gradientClassName,
  children,
}: {
  label: string;
  gradientClassName: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  if (open) {
    return (
      <div className="rounded-app border border-admin-border bg-admin-card p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="m-0 text-sm font-semibold text-night-text">{label}</p>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Закрыть форму"
            className="text-admin-muted hover:text-night-text"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className={`self-start rounded-full px-5 py-2.5 text-sm font-bold text-white ${gradientClassName}`}
    >
      + {label}
    </button>
  );
}
