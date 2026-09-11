import type { CompetitionStatistics } from "@/server/statistics/competition-statistics";
import { StatCard } from "@/components/admin/StatCard";
import { Card } from "@/components/ui/card";
import { Donut, DonutLegend } from "@/components/charts/Donut";
import { StackedBar } from "@/components/charts/StackedBar";

// Сводка по соревнованию (Этап 11) — считается на лету из уже существующих
// данных, ничего заранее не кэшируется. KPI-сетка вместо текстовых строк
// (redesign, 2026-09-08) — те же самые цифры, просто визуально плотнее.
// Донат "роли" и полоса "явка" (добавлено позже) — та же самая статистика,
// просто ещё один способ её увидеть; новых запросов к БД не добавляют.
export function CompetitionStatisticsPanel({ statistics }: { statistics: CompetitionStatistics }) {
  const cards = [
    { label: "Регистраций", value: statistics.registrationsCount },
    { label: "Партнёров", value: statistics.leadersCount },
    { label: "Партнёрш", value: statistics.followersCount },
    { label: "Check-in", value: statistics.checkedInCount, accent: true },
    { label: "Не пришли", value: statistics.noShowCount },
    { label: "Снялись", value: statistics.scratchedCount },
    { label: "Дисквалифицированы", value: statistics.disqualifiedCount },
    { label: "Судей", value: statistics.judgesCount },
    { label: "Категорий", value: statistics.divisionsCount },
    { label: "Раундов", value: statistics.roundsCount },
    { label: "Перетанцовок", value: statistics.tieBreakRoundsCount },
    { label: "Заходов", value: statistics.heatsCount },
  ];

  const rolesTotal = statistics.leadersCount + statistics.followersCount;
  const pendingCheckIn = Math.max(
    0,
    statistics.registrationsCount - statistics.checkedInCount - statistics.noShowCount
  );
  const attendanceTotal = statistics.registrationsCount + statistics.scratchedCount + statistics.disqualifiedCount;

  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 font-semibold text-night-text">Статистика соревнования</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map((c) => (
          <StatCard key={c.label} label={c.label} value={c.value} accent={c.accent} />
        ))}
      </div>
      {statistics.durationMinutes !== null && (
        <p className="m-0 text-sm text-admin-muted">
          Длительность: {Math.round(statistics.durationMinutes / 60)} ч {statistics.durationMinutes % 60} мин
        </p>
      )}

      {(rolesTotal > 0 || attendanceTotal > 0) && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {rolesTotal > 0 && (
            <Card className="border-admin-border bg-admin-card text-admin-muted">
              <p className="m-0 mb-3 text-sm font-semibold text-night-text">Баланс ролей</p>
              <div className="flex items-center gap-4">
                <Donut
                  segments={[
                    { label: "Партнёры", value: statistics.leadersCount, colorClassName: "text-admin-primary" },
                    { label: "Партнёрши", value: statistics.followersCount, colorClassName: "text-admin-violet" },
                  ]}
                  trackClassName="text-admin-border"
                  centerValue={rolesTotal}
                  centerLabel="всего"
                />
                <DonutLegend
                  segments={[
                    { label: "Партнёры", value: statistics.leadersCount, colorClassName: "text-admin-primary" },
                    { label: "Партнёрши", value: statistics.followersCount, colorClassName: "text-admin-violet" },
                  ]}
                />
              </div>
            </Card>
          )}

          {attendanceTotal > 0 && (
            <Card className="border-admin-border bg-admin-card text-admin-muted">
              <p className="m-0 mb-3 text-sm font-semibold text-night-text">Явка</p>
              <StackedBar
                total={attendanceTotal}
                trackClassName="bg-admin-border"
                segments={[
                  { label: "Пришли", value: statistics.checkedInCount, colorClassName: "bg-night-success" },
                  { label: "Не пришли", value: statistics.noShowCount, colorClassName: "bg-night-warning" },
                  { label: "Ожидают check-in", value: pendingCheckIn, colorClassName: "bg-admin-primary/50" },
                  { label: "Снялись", value: statistics.scratchedCount, colorClassName: "bg-admin-muted" },
                  { label: "Дисквалифицированы", value: statistics.disqualifiedCount, colorClassName: "bg-red-400" },
                ]}
              />
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
