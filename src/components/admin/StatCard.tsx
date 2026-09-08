import { Card } from "@/components/ui/card";

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
}: {
  label: string;
  value: string | number;
  accent?: boolean;
  icon?: React.ReactNode;
  tone?: keyof typeof ICON_TONE;
  percent?: number;
}) {
  if (icon) {
    return (
      <Card className="border-admin-border bg-admin-card">
        <div className="flex items-center justify-between gap-2">
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${ICON_TONE[tone]}`}>{icon}</span>
          {percent !== undefined && <span className={`text-sm font-semibold ${PERCENT_TONE[tone]}`}>{percent}%</span>}
        </div>
        <p className="m-0 mt-2 text-sm text-admin-muted">{label}</p>
        <p className="m-0 mt-0.5 text-2xl font-extrabold text-night-text">{value}</p>
      </Card>
    );
  }

  return (
    <Card className="border-admin-border bg-admin-card">
      <p className="m-0 text-sm text-admin-muted">{label}</p>
      <p className={`m-0 mt-1 text-2xl font-extrabold ${accent ? "text-admin-primaryHover" : "text-night-text"}`}>{value}</p>
    </Card>
  );
}
