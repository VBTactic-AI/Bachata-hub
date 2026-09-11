import { Card } from "@/components/ui/card";
import type { CompetitorStatistics, RoleStatistics } from "@/server/statistics/competitor-statistics";
import { Donut, DonutLegend } from "@/components/charts/Donut";
import { BarRow } from "@/components/charts/BarRow";

const ROLE_LABELS: Record<string, string> = { LEADER: "Партнёр", FOLLOWER: "Партнёрша" };

function pct(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

// Донат "чего добился" (победы/подиум без побед/финалы без подиума/остальное)
// — те же самые счётчики (winsCount ⊆ podiumsCount ⊆ finalsCount ⊆
// competitionsCount по построению, CLAUDE.md §37), просто разложены на
// непересекающиеся сегменты для наглядности.
function RoleStatsRow({ label, stats }: { label: string; stats: RoleStatistics }) {
  const podiumOnly = Math.max(0, stats.podiumsCount - stats.winsCount);
  const finalsOnly = Math.max(0, stats.finalsCount - stats.podiumsCount);
  const other = Math.max(0, stats.competitionsCount - stats.finalsCount);

  return (
    <div className="flex flex-col gap-3 rounded-app-sm border border-night-border bg-night-card2 p-3">
      <strong className="text-night-text">{label}</strong>
      <div className="flex flex-wrap items-center gap-4">
        <Donut
          size={84}
          strokeWidth={11}
          trackClassName="text-night-border"
          centerValue={stats.competitionsCount}
          centerLabel="конкурсов"
          segments={[
            { label: "Победы", value: stats.winsCount, colorClassName: "text-night-success" },
            { label: "Подиум", value: podiumOnly, colorClassName: "text-night-primary" },
            { label: "Финалы", value: finalsOnly, colorClassName: "text-night-pink" },
            { label: "Остальное", value: other, colorClassName: "text-night-muted" },
          ]}
        />
        <DonutLegend
          segments={[
            { label: "Победы", value: stats.winsCount, colorClassName: "text-night-success" },
            { label: "Подиум (2-3 место)", value: podiumOnly, colorClassName: "text-night-primary" },
            { label: "Финалы без подиума", value: finalsOnly, colorClassName: "text-night-pink" },
            { label: "Не дошёл до финала", value: other, colorClassName: "text-night-muted" },
          ]}
        />
      </div>
      <p className="m-0 text-sm text-night-muted">
        Лучшее место: {stats.bestPlacement ?? "—"} · Среднее место: {stats.averagePlacement ? stats.averagePlacement.toFixed(1) : "—"}
      </p>
      <div className="flex flex-col gap-2">
        <BarRow label="Средний балл судей" fraction={stats.averageScore} displayValue={pct(stats.averageScore)} colorClassName="bg-night-primary" trackClassName="bg-night-border" />
        <BarRow
          label="Доля прохождения дальше"
          fraction={stats.qualificationRate}
          displayValue={pct(stats.qualificationRate)}
          colorClassName="bg-night-success"
          trackClassName="bg-night-border"
        />
      </div>
    </div>
  );
}

// Личная статистика танцора (Этап 11) — по данным официальных результатов
// (Result, Этап 10) и полученных судейских оценок. Партнёрская статистика
// (уникальные/повторные партнёры) не считается — Draw Engine не хранит,
// кто с кем танцевал (docs/00_DECISIONS.md, A5), подтверждено пользователем.
export function CompetitorStatisticsCard({ statistics }: { statistics: CompetitorStatistics }) {
  if (statistics.overall.competitionsCount === 0 && statistics.noShowsCount === 0) {
    return null;
  }
  return (
    <Card className="border-night-border bg-night-card">
      <h2 className="m-0 mb-2 font-night text-base font-bold text-night-text">Моя статистика</h2>
      <div className="mt-2 flex flex-col gap-3">
        {statistics.overall.competitionsCount > 0 && <RoleStatsRow label="Всего" stats={statistics.overall} />}
        {(["LEADER", "FOLLOWER"] as const).map(
          (role) =>
            statistics.byRole[role].competitionsCount > 0 && (
              <RoleStatsRow key={role} label={ROLE_LABELS[role]} stats={statistics.byRole[role]} />
            )
        )}
        {statistics.noShowsCount > 0 && (
          <p className="m-0 text-sm text-night-muted">Не явился на check-in: {statistics.noShowsCount}</p>
        )}
      </div>
    </Card>
  );
}
