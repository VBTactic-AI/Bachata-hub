import type { CompetitionStatistics } from "@/server/statistics/competition-statistics";
import { StatCard } from "@/components/admin/StatCard";

// Сводка по соревнованию (Этап 11) — считается на лету из уже существующих
// данных, ничего заранее не кэшируется. KPI-сетка вместо текстовых строк
// (redesign, 2026-09-08) — те же самые цифры, просто визуально плотнее.
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
    </div>
  );
}
