import { Card } from "@/components/ui/card";
import type { CompetitorStatistics, RoleStatistics } from "@/server/statistics/competitor-statistics";

const ROLE_LABELS: Record<string, string> = { LEADER: "Ведущий", FOLLOWER: "Ведомый" };

function pct(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

function RoleStatsRow({ label, stats }: { label: string; stats: RoleStatistics }) {
  return (
    <div className="flex flex-col gap-0.5">
      <strong className="text-night-text">{label}</strong>
      <p className="m-0 text-sm text-night-muted">
        Конкурсов: {stats.competitionsCount} · Побед: {stats.winsCount} · Подиумов: {stats.podiumsCount} · Финалов: {stats.finalsCount}
      </p>
      <p className="m-0 text-sm text-night-muted">
        Лучшее место: {stats.bestPlacement ?? "—"} · Среднее место: {stats.averagePlacement ? stats.averagePlacement.toFixed(1) : "—"}
      </p>
      <p className="m-0 text-sm text-night-muted">
        Средний балл судей: {pct(stats.averageScore)} · Доля прохождения дальше: {pct(stats.qualificationRate)}
      </p>
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
