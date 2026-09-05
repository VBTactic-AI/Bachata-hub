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
    return <div className="rounded-app border border-night-border bg-night-card p-4">{children}</div>;
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
