"use client";

import { cn } from "@/lib/cn";

const TONE_ON = {
  primary: "bg-admin-primary",
  success: "bg-night-success",
} as const;

// Тумблер вкл/выкл (redesign вкладки "Участники", 2026-09-09 — check-in
// должен переключаться в обе стороны прямо в таблице). /admin-only токены
// (admin-primary/admin-card2), поэтому живёт здесь, а не в components/ui —
// та же граница, что и остальные /admin-специфичные компоненты этой сессии.
// tone="success" — зелёный вместо синего, когда включённое состояние = "всё
// хорошо" (check-in пройден), а не просто нейтральный факт "включено".
export function Switch({
  checked,
  onChange,
  disabled,
  label,
  tone = "primary",
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  label: string;
  tone?: keyof typeof TONE_ON;
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
        checked ? TONE_ON[tone] : "bg-admin-card2"
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
