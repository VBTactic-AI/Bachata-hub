import type { RegistrationRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { mean } from "./stats-math";

// Личная статистика танцора (CLAUDE.md §37) — считается "на лету" из уже
// существующих данных (Result — Этап 10, RoundResult, JudgeScore/
// FinalJudgeScore), никакой отдельной таблицы не заводим. Самостоятельная
// просмотр своей статистики (страница профиля) не требует RBAC-проверки —
// как и уже существующий блок "Мои соревнования" на той же странице.
//
// Партнёрская статистика (уникальные/повторные партнёры, docs/02 §14)
// сознательно не считается — Draw Engine не хранит и не назначает конкретные
// пары (docs/00_DECISIONS.md, A5), считать её физически не из чего.
// Подтверждено пользователем явно (2026-09-05).

export type RoleStatistics = {
  competitionsCount: number;
  winsCount: number;
  podiumsCount: number; // место 1..3
  finalsCount: number; // дошёл до финального раунда дивизиона
  bestPlacement: number | null;
  averagePlacement: number | null;
  averageScore: number | null; // нормализованная 0..1 (доля от максимума шкалы/критерия)
  qualificationRate: number | null; // доля ADVANCED среди всех сыгранных обычных раундов
};

export type CompetitorStatistics = {
  overall: RoleStatistics;
  byRole: Record<RegistrationRole, RoleStatistics>;
};

type CurrentResultRow = {
  divisionId: string;
  registrationId: string;
  version: number;
  status: "FINALIST" | "ELIMINATED";
  placement: number | null;
  competitionId: string;
  role: RegistrationRole;
};

function buildRoleStatistics(
  results: CurrentResultRow[],
  advancementCounts: { role: RegistrationRole; advanced: boolean }[],
  normalizedScores: { role: RegistrationRole; value: number }[]
): RoleStatistics {
  const competitionsCount = new Set(results.map((r) => r.competitionId)).size;
  const finalists = results.filter((r) => r.status === "FINALIST");
  const placements = finalists.map((r) => r.placement).filter((p): p is number => p !== null);

  return {
    competitionsCount,
    winsCount: placements.filter((p) => p === 1).length,
    podiumsCount: placements.filter((p) => p <= 3).length,
    finalsCount: finalists.length,
    bestPlacement: placements.length > 0 ? Math.min(...placements) : null,
    averagePlacement: mean(placements),
    averageScore: mean(normalizedScores.map((s) => s.value)),
    qualificationRate: advancementCounts.length > 0 ? advancementCounts.filter((a) => a.advanced).length / advancementCounts.length : null,
  };
}

export async function getCompetitorStatistics(dancerId: string): Promise<CompetitorStatistics> {
  const [resultRows, roundResults, judgeScores, finalJudgeScores] = await Promise.all([
    prisma.result.findMany({
      where: { registration: { dancerId } },
      orderBy: { version: "desc" },
      select: {
        divisionId: true,
        registrationId: true,
        version: true,
        status: true,
        placement: true,
        registration: { select: { role: true, competitionId: true } },
      },
    }),
    prisma.roundResult.findMany({
      where: { registration: { dancerId }, round: { type: null } },
      select: { status: true, registration: { select: { role: true } } },
    }),
    prisma.judgeScore.findMany({
      where: { drawParticipant: { registration: { dancerId } } },
      select: { value: true, maxValue: true, drawParticipant: { select: { role: true } } },
    }),
    prisma.finalJudgeScore.findMany({
      where: { drawParticipant: { registration: { dancerId } } },
      select: {
        value: true,
        criterion: { select: { minScore: true, maxScore: true } },
        drawParticipant: { select: { role: true } },
      },
    }),
  ]);

  // Только последняя (текущая) версия Result на каждый (divisionId, registrationId).
  const latest = new Map<string, (typeof resultRows)[number]>();
  for (const r of resultRows) {
    const key = `${r.divisionId}:${r.registrationId}`;
    if (!latest.has(key)) latest.set(key, r);
  }
  const currentResults: CurrentResultRow[] = [...latest.values()].map((r) => ({
    divisionId: r.divisionId,
    registrationId: r.registrationId,
    version: r.version,
    status: r.status,
    placement: r.placement,
    competitionId: r.registration.competitionId,
    role: r.registration.role,
  }));

  const advancement = roundResults
    .filter((r) => r.status !== "TIE_BREAK_REQUIRED")
    .map((r) => ({ role: r.registration.role, advanced: r.status === "ADVANCED" }));

  const normalizedScores = [
    ...judgeScores.map((s) => ({ role: s.drawParticipant.role, value: s.maxValue > 0 ? s.value / s.maxValue : 0 })),
    ...finalJudgeScores.map((s) => {
      const range = s.criterion.maxScore - s.criterion.minScore;
      return { role: s.drawParticipant.role, value: range > 0 ? (s.value - s.criterion.minScore) / range : 0 };
    }),
  ];

  const byRole = {} as Record<RegistrationRole, RoleStatistics>;
  for (const role of ["LEADER", "FOLLOWER"] as const) {
    byRole[role] = buildRoleStatistics(
      currentResults.filter((r) => r.role === role),
      advancement.filter((a) => a.role === role),
      normalizedScores.filter((s) => s.role === role)
    );
  }

  return { overall: buildRoleStatistics(currentResults, advancement, normalizedScores), byRole };
}
