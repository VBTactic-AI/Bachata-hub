import type { RoundStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "../rbac/authorize";
import { getMyJudgeAssignments } from "./judge-assignment";
import { ROUND_TYPE_LABELS } from "@/lib/competition-labels";

export type JudgeDivisionRound = {
  roundId: string;
  status: RoundStatus;
  label: string;
  // Финал (FinalSession уже создана этим раундом, "Начать финал") — экран
  // судьи (judging/[competitionId]/page.tsx) рисует для такого этапа
  // FinalJudgingScreen, а не обычную доску JudgingRoundBoard.
  isFinal: boolean;
};

export type JudgeDivision = {
  divisionId: string;
  categoryName: string;
  rounds: JudgeDivisionRound[];
};

// Структура "мои категории → их этапы" целиком, для вкладок на экране судьи
// (2026-09-10, по прямому запросу пользователя — раньше раунды без ещё
// вызванных участников (getJudgeQueue отдаёт только ИТЕМЫ, то есть только
// уже сформированные заходы) вообще не попадали на экран судьи, и он не мог
// увидеть всю сетку этапов категории сразу). Здесь — только СТРУКТУРА
// (раунды со статусом), без самого списка участников/оценок — те считаются
// отдельно (getJudgeQueue для обычных раундов, getFinalJudgeQueue для
// каждого финала), эта функция их не дублирует.
export async function getJudgeDivisionsOverview(competitionId: string): Promise<JudgeDivision[]> {
  const actor = await requirePermission("score:submit", competitionId);

  const myAssignments = await getMyJudgeAssignments(actor.userId, competitionId);
  if (myAssignments.length === 0) return [];
  const divisionIds = [...new Set(myAssignments.map((a) => a.divisionId))];

  const divisions = await prisma.division.findMany({
    where: { id: { in: divisionIds } },
    select: {
      id: true,
      category: { select: { name: true, order: true } },
      rounds: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          status: true,
          type: true,
          stage: { select: { name: true } },
          finalSession: { select: { id: true } },
        },
      },
    },
  });
  divisions.sort((a, b) => a.category.order - b.category.order);

  return divisions.map((d) => ({
    divisionId: d.id,
    categoryName: d.category.name,
    rounds: d.rounds.map((r) => ({
      roundId: r.id,
      status: r.status,
      label: r.type ? (ROUND_TYPE_LABELS[r.type] ?? r.type) : (r.stage?.name ?? "Этап"),
      isFinal: r.finalSession !== null,
    })),
  }));
}
