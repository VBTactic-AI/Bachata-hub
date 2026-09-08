import { Card, cardVariants } from "@/components/ui/card";
import { cn } from "@/lib/cn";

const ICON_TONE = {
  primary: "bg-admin-primary/15 text-admin-primaryHover",
  success: "bg-night-success/15 text-night-success",
  danger: "bg-red-400/15 text-red-400",
} as const;

const PERCENT_TONE = {
  primary: "text-admin-primaryHover",
  success: "text-night-success",
  danger: "text-red-400",
} as const;

// Переиспользуемая KPI-карточка (CLAUDE.md/задача redesign §21 — не плодить
// дубликаты инлайн-вёрстки). icon/tone/percent — опциональны (redesign
// вкладки "Участники", 2026-09-09, по референсу пользователя): без них
// карточка остаётся прежней простой парой label/value, как на вкладках
// "Основное"/"Судьи".
export function StatCard({
  label,
  value,
  accent,
  icon,
  tone = "primary",
  percent,
  onClick,
  active,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
  icon?: React.ReactNode;
  tone?: keyof typeof ICON_TONE;
  percent?: number;
  // Необязательно — карточка одновременно и сводка, и быстрый фильтр (по
  // запросу пользователя, 2026-09-09: "ещё фильтр оплаты" — второй, более
  // заметный вход в тот же фильтр, что и выпадающий список над таблицей).
  onClick?: () => void;
  active?: boolean;
}) {
  if (icon) {
    const body = (
      <>
        <div className="flex items-center justify-between gap-2">
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${ICON_TONE[tone]}`}>{icon}</span>
          {percent !== undefined && <span className={`text-sm font-semibold ${PERCENT_TONE[tone]}`}>{percent}%</span>}
        </div>
        <p className="m-0 mt-2 text-sm text-admin-muted">{label}</p>
        <p className="m-0 mt-0.5 text-2xl font-extrabold text-night-text">{value}</p>
      </>
    );

    if (onClick) {
      return (
        <button
          type="button"
          onClick={onClick}
          aria-pressed={active}
          className={cn(
            cardVariants(),
            "w-full border-admin-border bg-admin-card text-left transition-colors hover:border-admin-primary/60",
            active && "border-admin-primary ring-1 ring-admin-primary/40"
          )}
        >
          {body}
        </button>
      );
    }

    return <Card className="border-admin-border bg-admin-card">{body}</Card>;
  }

  return (
    <Card className="border-admin-border bg-admin-card">
      <p className="m-0 text-sm text-admin-muted">{label}</p>
      <p className={`m-0 mt-1 text-2xl font-extrabold ${accent ? "text-admin-primaryHover" : "text-night-text"}`}>{value}</p>
    </Card>
  );
}
