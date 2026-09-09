import { Card } from "@/components/ui/card";
import type { ActiveCategoryRow } from "@/lib/competition-overview";
import { cn } from "@/lib/cn";

const PILL_CLASS: Record<ActiveCategoryRow["statusVariant"], string> = {
  blue: "bg-admin-primary/15 text-admin-primaryHover",
  amber: "bg-amber-400/15 text-amber-400",
  red: "bg-red-400/15 text-red-400",
  green: "bg-night-success/15 text-night-success",
};

// Параллельно с паркетом (FloorSpotlight) — где ещё в этот момент идёт
// жеребьёвка/судейство/tie-break, по всем категориям сразу (redesign вкладки
// "Главная", CLAUDE.md §64).
export function OtherActiveCategoriesList({ rows }: { rows: ActiveCategoryRow[] }) {
  return (
    <Card className="border-admin-border bg-admin-card">
      <p className="m-0 font-semibold text-night-text">Другие категории сейчас</p>
      <p className="m-0 mt-0.5 text-sm text-admin-muted">Параллельно с паркетом — где идёт судейство, жеребьёвка или ожидает решения</p>
      {rows.length === 0 ? (
        <p className="m-0 mt-3 text-sm text-admin-muted">Сейчас больше ничего не идёт параллельно.</p>
      ) : (
        <div className="mt-3 flex flex-col">
          {rows.map((row, i) => (
            // Обычный <a>, не next/link — см. FloorSpotlight.tsx.
            <a
              key={row.roundId}
              href={row.monitorHref}
              className={cn(
                "flex flex-wrap items-center gap-3 rounded-app-sm px-1 py-3 text-sm transition-colors hover:bg-admin-card2",
                i > 0 && "border-t border-admin-border"
              )}
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: row.categoryColor }} />
              <span className="min-w-[110px] font-bold text-night-text">{row.categoryName}</span>
              <span className={cn("whitespace-nowrap rounded-full px-2.5 py-0.5 text-[0.72rem] font-bold", PILL_CLASS[row.statusVariant])}>
                {row.statusLabel}
              </span>
              <span className="flex-1 text-admin-muted">{row.detail}</span>
              <span className="text-admin-disabled">›</span>
            </a>
          ))}
        </div>
      )}
    </Card>
  );
}
