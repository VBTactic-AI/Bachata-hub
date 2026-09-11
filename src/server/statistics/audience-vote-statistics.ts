import type { AudienceVoteRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "../rbac/authorize";

// Приз зрительских симпатий — статистика считается "на лету" из
// AudienceVoteWinner (Этап "Приз зрительских симпатий"), тем же принципом,
// что и остальная статистика (CLAUDE.md §37, docs/00_DECISIONS.md A24) —
// отдельной таблицы под неё не заводим. Учитываются только ОПУБЛИКОВАННЫЕ
// голосования (audienceVote.publishedAt != null) — неопубликованный/
// отменённый результат никогда не попадает в статистику/профиль.

const AWARD_SELECT = {
  role: true,
  voteCount: true,
  confirmedAt: true,
  registration: { select: { dancerId: true, dancer: { select: { displayName: true } } } },
  audienceVote: {
    select: {
      publishedAt: true,
      division: { select: { category: { select: { name: true } }, competition: { select: { id: true, name: true } } } },
    },
  },
} as const;

type AwardRow = {
  role: AudienceVoteRole;
  voteCount: number;
  confirmedAt: Date;
  registration: { dancerId: string; dancer: { displayName: string } };
  audienceVote: { publishedAt: Date | null; division: { category: { name: string }; competition: { id: string; name: string } } };
};

export type AudienceAward = {
  dancerId: string;
  displayName: string;
  competitionId: string;
  competitionName: string;
  categoryName: string;
  role: AudienceVoteRole;
  voteCount: number;
  achievedAt: string;
};

function toAward(r: AwardRow): AudienceAward {
  return {
    dancerId: r.registration.dancerId,
    displayName: r.registration.dancer.displayName,
    competitionId: r.audienceVote.division.competition.id,
    competitionName: r.audienceVote.division.competition.name,
    categoryName: r.audienceVote.division.category.name,
    role: r.role,
    voteCount: r.voteCount,
    achievedAt: (r.audienceVote.publishedAt ?? r.confirmedAt).toISOString(),
  };
}

export async function getAudienceAwardsForDancer(dancerId: string): Promise<AudienceAward[]> {
  const rows = await prisma.audienceVoteWinner.findMany({
    where: { registration: { dancerId }, audienceVote: { publishedAt: { not: null } } },
    orderBy: { confirmedAt: "desc" },
    select: AWARD_SELECT,
  });
  return rows.map(toAward);
}

// Сводка по всем соревнованиям сразу — доступна только SUPER_ADMIN.
// requirePermission БЕЗ competitionId проверяет только глобальные права
// (src/server/rbac/authorize.ts, can()) — точечных назначений этого права
// по CompetitionMember не предполагается, только SUPER_ADMIN-мост.
export async function getAudienceAwardLeaderboard(): Promise<AudienceAward[]> {
  await requirePermission("statistics:view");

  const rows = await prisma.audienceVoteWinner.findMany({
    where: { audienceVote: { publishedAt: { not: null } } },
    orderBy: { confirmedAt: "desc" },
    select: AWARD_SELECT,
  });
  return rows.map(toAward);
}
