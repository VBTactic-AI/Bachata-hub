import type { CompetitionStatistics } from "@/server/statistics/competition-statistics";

// Сводка по соревнованию (Этап 11) — считается на лету из уже существующих
// данных, ничего заранее не кэшируется.
export function CompetitionStatisticsPanel({ statistics }: { statistics: CompetitionStatistics }) {
  return (
    <div className="rounded-app-sm border border-line p-3 stack gap-1">
      <p className="m-0 font-semibold">Статистика соревнования</p>
      <p className="hint-text m-0">
        Регистраций: {statistics.registrationsCount} (Ведущих: {statistics.leadersCount}, Ведомых: {statistics.followersCount}) ·
        Снялись: {statistics.scratchedCount} · Дисквалифицированы: {statistics.disqualifiedCount}
      </p>
      <p className="hint-text m-0">
        Check-in: {statistics.checkedInCount} · Не пришли: {statistics.noShowCount} · Судей: {statistics.judgesCount}
      </p>
      <p className="hint-text m-0">
        Дивизионов: {statistics.divisionsCount} · Раундов: {statistics.roundsCount} (из них перетанцовок: {statistics.tieBreakRoundsCount}) ·
        Заходов: {statistics.heatsCount}
      </p>
      {statistics.durationMinutes !== null && (
        <p className="hint-text m-0">Длительность: {Math.round(statistics.durationMinutes / 60)} ч {statistics.durationMinutes % 60} мин</p>
      )}
    </div>
  );
}
