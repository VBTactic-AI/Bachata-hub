"use client";

import { cn } from "@/lib/cn";

// Тумблер вкл/выкл (redesign вкладки "Участники", 2026-09-09 — check-in
// должен переключаться в обе стороны прямо в таблице). /admin-only токены
// (admin-primary/admin-card2), поэтому живёт здесь, а не в components/ui —
// та же граница, что и остальные /admin-специфичные компоненты этой сессии.
export function Switch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-admin-primary" : "bg-admin-card2"
      )}
    >
      <span
        className={cn(
          "inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform",
          checked ? "translate-x-[18px]" : "translate-x-1"
        )}
      />
    </button>
  );
}
