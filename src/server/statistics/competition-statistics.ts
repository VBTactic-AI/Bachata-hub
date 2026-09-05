import { prisma } from "@/lib/prisma";
import { requirePermission } from "../rbac/authorize";
import { isCheckInPhaseOver } from "../competition/no-show";

// Статистика соревнования (CLAUDE.md §37) — считается "на лету" из уже
// существующих таблиц, без отдельного снимка/кэша (проще и всегда актуально;
// если станет медленно на больших соревнованиях — можно закэшировать
// отдельно). Штрафы/дисквалификации сознательно не входят в объём этого
// этапа — Penalty/Disqualification workflow не реализован (Этап 7, A16),
// поэтому здесь только фактические scratched/disqualified по Registration.status.
export type CompetitionStatistics = {
  registrationsCount: number;
  leadersCount: number;
  followersCount: number;
  scratchedCount: number;
  disqualifiedCount: number;
  checkedInCount: number;
  noShowCount: number;
  judgesCount: number;
  divisionsCount: number;
  roundsCount: number;
  tieBreakRoundsCount: number;
  heatsCount: number;
  durationMinutes: number | null;
};

export async function getCompetitionStatistics(competitionId: string): Promise<CompetitionStatistics> {
  await requirePermission("statistics:view", competitionId);

  const [registrationsByStatus, checkedInCount, noShowCandidatesCount, divisionsCount, roundsCount, tieBreakRoundsCount, heatsCount, judgeAssignments, competition] =
    await Promise.all([
      prisma.registration.groupBy({ by: ["status", "role"], where: { competitionId }, _count: { _all: true } }),
      prisma.checkIn.count({ where: { competitionId, status: { in: ["CHECKED_IN", "LATE"] } } }),
      // "Не пришли" — не отдельный статус в БД, считается на лету
      // (docs/05_STATUS_REFERENCE.md, Часть Г, п.5 / src/server/competition/no-show.ts):
      // REGISTERED без CheckIn. Гейт "окно check-in уже закрылось" применяем
      // ниже, когда известен competition.status — до этого возвращаем 0, а
      // не заранее посчитанное число, иначе тот, кто ещё просто не подошёл
      // к стойке, на глазах у организатора выглядел бы "не явившимся".
      prisma.registration.count({ where: { competitionId, status: "REGISTERED", checkIn: null } }),
      prisma.division.count({ where: { competitionId } }),
      prisma.round.count({ where: { division: { competitionId } } }),
      prisma.round.count({ where: { division: { competitionId }, type: "TIE_BREAK" } }),
      prisma.heat.count({ where: { round: { division: { competitionId } } } }),
      prisma.judgeAssignment.findMany({ where: { division: { competitionId } }, select: { judgeUserId: true }, distinct: ["judgeUserId"] }),
      prisma.competition.findUniqueOrThrow({ where: { id: competitionId }, select: { startAt: true, endAt: true, status: true } }),
    ]);
  const noShowCount = isCheckInPhaseOver(competition.status) ? noShowCandidatesCount : 0;

  function sumWhere<T extends { _count: { _all: number } }>(rows: T[], predicate: (r: T) => boolean): number {
    return rows.filter(predicate).reduce((sum, r) => sum + r._count._all, 0);
  }
  const countBy = (rows: { status: string; _count: { _all: number } }[], status: string) => sumWhere(rows, (r) => r.status === status);

  const registrationsCount = countBy(registrationsByStatus, "REGISTERED");
  const leadersCount = sumWhere(registrationsByStatus, (r) => r.status === "REGISTERED" && r.role === "LEADER");
  const followersCount = sumWhere(registrationsByStatus, (r) => r.status === "REGISTERED" && r.role === "FOLLOWER");

  const durationMinutes =
    competition.startAt && competition.endAt
      ? Math.round((competition.endAt.getTime() - competition.startAt.getTime()) / 60000)
      : null;

  return {
    registrationsCount,
    leadersCount,
    followersCount,
    scratchedCount: countBy(registrationsByStatus, "SCRATCHED"),
    disqualifiedCount: countBy(registrationsByStatus, "DISQUALIFIED"),
    checkedInCount,
    noShowCount,
    judgesCount: judgeAssignments.length,
    divisionsCount,
    roundsCount,
    tieBreakRoundsCount,
    heatsCount,
    durationMinutes,
  };
}
