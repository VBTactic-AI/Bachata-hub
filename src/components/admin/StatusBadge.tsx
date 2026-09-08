import { cn } from "@/lib/cn";

// Компактный статус-индикатор ("● Активен", "✓ Check-in", "× Не прошёл" —
// задача redesign §14) — переиспользуемый, вместо разрозненных inline
// <span> по всей вкладке "Участники".
const DOT_VARIANTS = {
  success: "bg-night-success",
  danger: "bg-red-400",
  warning: "bg-night-warning",
  neutral: "bg-admin-disabled",
} as const;

export function StatusBadge({
  label,
  variant = "neutral",
  className,
}: {
  label: string;
  variant?: keyof typeof DOT_VARIANTS;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full bg-admin-card2 px-2.5 py-1 text-xs font-semibold text-night-text", className)}>
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", DOT_VARIANTS[variant])} aria-hidden="true" />
      {label}
    </span>
  );
}
