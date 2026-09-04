import { prisma } from "@/lib/prisma";
import { requirePermission } from "../rbac/authorize";
import { writeAudit } from "../audit/audit";
import { ValidationFailedError } from "../errors";
import { maybeFinalizeFinalAfterScoreInTx } from "./final-advancement";
import { allowedJudgeRole } from "./final-scoring-matrix";

type CriterionSnapshot = { id: string; name: string; priority: number; minScore: number; maxScore: number; step: number };

// Судья ставит оценку по ОДНОМУ критерию одному вызванному (scored=true)
// участнику финала — параллельно обычному submitJudgeScore (scoring.ts), но
// с несколькими критериями вместо единой шкалы judgingMaxScore. Диапазон
// валидируется по СНИМКУ критериев (FinalSession.criteriaSnapshot), не по
// живой FinalCriterion — снимок зафиксирован при старте финала (CLAUDE.md
// §50-51), даже если сама FinalCriterion потом почему-то изменится (хотя
// final-settings.ts и не даёт это сделать, пока финал не завершён).
//
// clientSubmissionId — тот же офлайн-паттерн идемпотентности, что и у
// JudgeScore (CLAUDE.md §17): повторная отправка после потери связи не
// создаёт дубликат/лишний audit.
export async function submitFinalJudgeScore(
  drawParticipantId: string,
  criterionId: string,
  value: number,
  clientSubmissionId: string
): Promise<void> {
  const participant = await prisma.drawParticipant.findUniqueOrThrow({
    where: { id: drawParticipantId },
    relationLoadStrategy: "join",
    include: {
      draw: {
        include: {
          heat: {
            include: {
              round: { include: { division: { select: { id: true, competitionId: true } }, finalSession: true } },
            },
          },
        },
      },
    },
  });
  const heat = participant.draw.heat;
  const round = heat.round;
  const competitionId = round.division.competitionId;
  const actor = await requirePermission("score:submit", competitionId);

  if (!round.finalSession) {
    throw new ValidationFailedError("У этого раунда ещё не начат финал — критериальное судейство недоступно.");
  }
  if (!participant.scored) {
    throw new ValidationFailedError("Этот участник — помощник, его оценивать не нужно.");
  }
  if (heat.status === "PENDING") {
    throw new ValidationFailedError("Этот заход ещё не начался — оценивать пока нечего.");
  }
  if (round.status === "COMPLETED") {
    throw new ValidationFailedError("Финал уже завершён — оценку больше нельзя изменить.");
  }

  const criteria = round.finalSession.criteriaSnapshot as unknown as CriterionSnapshot[];
  const criterion = criteria.find((c) => c.id === criterionId);
  if (!criterion) {
    throw new ValidationFailedError("Этого критерия нет в зафиксированных правилах этого финала.");
  }
  if (!Number.isInteger(value) || value < criterion.minScore || value > criterion.maxScore) {
    throw new ValidationFailedError(`Оценка «${criterion.name}» должна быть целым числом от ${criterion.minScore} до ${criterion.maxScore}.`);
  }

  const requiredRole = allowedJudgeRole(criterionId, participant.role, round.finalSession.format, round.finalSession.config);
  const assignment = await prisma.judgeAssignment.findUnique({
    where: { divisionId_judgeUserId_role: { divisionId: round.division.id, judgeUserId: actor.userId, role: requiredRole } },
  });
  if (!assignment) {
    throw new ValidationFailedError("Вы не назначены оценивать этот критерий у этого участника в этом дивизионе.");
  }

  await prisma.$transaction(async (tx) => {
    const existing = await tx.finalJudgeScore.findUnique({
      where: { drawParticipantId_judgeAssignmentId_criterionId: { drawParticipantId, judgeAssignmentId: assignment.id, criterionId } },
    });
    if (existing && existing.clientSubmissionId === clientSubmissionId) {
      return; // повтор той же офлайн-отправки — уже применена
    }
    await tx.finalJudgeScore.upsert({
      where: { drawParticipantId_judgeAssignmentId_criterionId: { drawParticipantId, judgeAssignmentId: assignment.id, criterionId } },
      create: { drawParticipantId, judgeAssignmentId: assignment.id, criterionId, value, clientSubmissionId },
      update: { value, clientSubmissionId },
    });
    await writeAudit(tx, {
      actor,
      action: existing ? "final_score.correct" : "final_score.submit",
      entityType: "FinalJudgeScore",
      entityId: drawParticipantId,
      before: existing ? { criterionId, value: existing.value } : undefined,
      after: { criterionId, value },
    });
    await maybeFinalizeFinalAfterScoreInTx(tx, round.id, actor);
  });
}

export type FinalJudgeQueueItem = {
  drawParticipantId: string;
  role: "LEADER" | "FOLLOWER";
  bibNumber: string | null;
  displayName: string;
  scores: Record<string, number | null>; // criterionId -> моя оценка или null
  // Какие критерии ИМЕННО ЭТОТ судья вправе оценивать у этого участника —
  // в NORMAL/RANDOM_COUPLES всегда все критерии (своя роль = участнику), в
  // JUDGES_DANCE — подмножество: "танцующие" судьи видят только критерии
  // партнёрства, судьи со стороны — только остальные (allowedJudgeRole).
  criteriaIds: string[];
};

export type FinalJudgeQueue = {
  roundId: string;
  divisionName: string;
  criteria: CriterionSnapshot[]; // отсортированы по priority
  items: FinalJudgeQueueItem[]; // только участники МОЕЙ роли
  scoredCount: number;
  totalCount: number;
};

// Что видит судья на своём экране финала: критерии (по снимку правил),
// список финалистов его роли с уже проставленными им оценками (для
// восстановления состояния после перезагрузки/офлайн). null, если у судьи
// нет назначения на этот дивизион вообще, или финал ещё не начат.
export async function getFinalJudgeQueue(competitionId: string, roundId: string): Promise<FinalJudgeQueue | null> {
  const actor = await requirePermission("score:submit", competitionId);

  const round = await prisma.round.findUniqueOrThrow({
    where: { id: roundId },
    relationLoadStrategy: "join",
    include: {
      division: { select: { id: true, competitionId: true, category: { select: { name: true } } } },
      finalSession: true,
      heats: {
        include: {
          draws: {
            orderBy: { version: "desc" },
            take: 1,
            include: {
              participants: {
                where: { scored: true },
                include: {
                  registration: { include: { dancer: { select: { displayName: true } }, checkIn: { select: { bibNumber: true } } } },
                  finalJudgeScores: true,
                },
              },
            },
          },
        },
      },
    },
  });
  if (round.division.competitionId !== competitionId) {
    throw new ValidationFailedError("Раунд не принадлежит этому соревнованию.");
  }
  if (!round.finalSession) return null;

  const myAssignments = await prisma.judgeAssignment.findMany({ where: { divisionId: round.division.id, judgeUserId: actor.userId } });
  if (myAssignments.length === 0) return null;
  const myRoles = new Set(myAssignments.map((a) => a.role));
  const assignmentByRole = new Map(myAssignments.map((a) => [a.role, a]));

  const criteria = [...(round.finalSession.criteriaSnapshot as unknown as CriterionSnapshot[])].sort((a, b) => a.priority - b.priority);
  const format = round.finalSession.format;
  const config = round.finalSession.config;

  const items: FinalJudgeQueueItem[] = [];
  for (const heat of round.heats) {
    const draw = heat.draws[0];
    if (!draw) continue;
    for (const p of draw.participants) {
      // В NORMAL/RANDOM_COUPLES видна только своя роль (allowedJudgeRole
      // всегда возвращает participant.role); в JUDGES_DANCE участник может
      // быть виден СРАЗУ обеим ролям судей — просто разные критерии
      // редактируемы у каждой (см. allowedJudgeRole).
      const visibleCriteria = criteria.filter((c) => myRoles.has(allowedJudgeRole(c.id, p.role, format, config)));
      if (visibleCriteria.length === 0) continue;

      const scores: Record<string, number | null> = {};
      for (const c of visibleCriteria) {
        const myAssignment = assignmentByRole.get(allowedJudgeRole(c.id, p.role, format, config));
        const s = p.finalJudgeScores.find((fs) => fs.criterionId === c.id && fs.judgeAssignmentId === myAssignment?.id);
        scores[c.id] = s?.value ?? null;
      }
      items.push({
        drawParticipantId: p.id,
        role: p.role,
        bibNumber: p.registration.checkIn?.bibNumber ?? null,
        displayName: p.registration.dancer.displayName,
        scores,
        criteriaIds: visibleCriteria.map((c) => c.id),
      });
    }
  }
  items.sort((a, b) => Number(a.bibNumber ?? 0) - Number(b.bibNumber ?? 0));

  const scoredCount = items.filter((it) => it.criteriaIds.every((id) => it.scores[id] !== null)).length;

  return {
    roundId,
    divisionName: round.division.category.name,
    criteria,
    items,
    scoredCount,
    totalCount: items.length,
  };
}

export type MyActiveFinalRound = { roundId: string; divisionName: string };

// Для баннера/ссылки на главной странице судьи (/judging/[competitionId]) —
// какие финалы (новой критериальной системы) этому судье сейчас есть смысл
// открыть отдельно. Статусы раунда — тот же набор, что и getJudgeQueue
// (RUNNING/PAUSED/FINISHED/SCORING) для обычных раундов.
export async function listMyActiveFinalRounds(competitionId: string): Promise<MyActiveFinalRound[]> {
  const actor = await requirePermission("score:submit", competitionId);

  const myAssignments = await prisma.judgeAssignment.findMany({ where: { judgeUserId: actor.userId, division: { competitionId } } });
  if (myAssignments.length === 0) return [];
  const divisionIds = [...new Set(myAssignments.map((a) => a.divisionId))];

  const rounds = await prisma.round.findMany({
    where: {
      divisionId: { in: divisionIds },
      status: { in: ["RUNNING", "PAUSED", "FINISHED", "SCORING"] },
      finalSession: { isNot: null },
    },
    select: { id: true, division: { select: { category: { select: { name: true } } } } },
  });

  return rounds.map((r) => ({ roundId: r.id, divisionName: r.division.category.name }));
}
