import type { RegistrationRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "../rbac/authorize";
import { writeAudit } from "../audit/audit";
import { ValidationFailedError } from "../errors";
import { maybeFinalizeAfterScoreInTx } from "./advancement";

// Судья ставит оценку (0..Round.judgingMaxScore) одному вызванному
// (scored=true) участнику. Помощников (scored=false) оценивать нельзя —
// CLAUDE.md §16, judge оценивает competitor, не пару, и помощник не в
// зачёте. Missing score НЕ превращается в 0 сам по себе (CLAUDE.md §16) —
// пока судья не отправил оценку, строки JudgeScore просто нет.
//
// clientSubmissionId — ключ идемпотентности офлайн-очереди клиента
// (CLAUDE.md §17): судейский телефон мог временно потерять связь и
// повторить отправку той же самой оценки после восстановления. Если это
// ТА ЖЕ отправка (совпадает clientSubmissionId с уже сохранённым) — молча
// не переписываем строку и не пишем новый audit (иначе повторные ретраи
// засоряли бы историю "score.correct" записями без реального изменения).
// Новое значение от судьи (реальное ручное исправление) всегда приходит с
// новым clientSubmissionId и обрабатывается как обычно.
export async function submitJudgeScore(drawParticipantId: string, value: number, clientSubmissionId: string): Promise<void> {
  const participant = await prisma.drawParticipant.findUniqueOrThrow({
    where: { id: drawParticipantId },
    relationLoadStrategy: "join",
    include: {
      draw: {
        include: {
          heat: { include: { round: { include: { division: { select: { id: true, competitionId: true } } } } } },
        },
      },
    },
  });
  const heat = participant.draw.heat;
  const round = heat.round;
  const competitionId = round.division.competitionId;
  const actor = await requirePermission("score:submit", competitionId);

  if (!participant.scored) {
    throw new ValidationFailedError("Этот участник — помощник, его оценивать не нужно.");
  }
  if (heat.status === "PENDING") {
    throw new ValidationFailedError("Этот заход ещё не начался — оценивать пока нечего.");
  }
  if (round.status === "COMPLETED") {
    throw new ValidationFailedError("Раунд уже завершён — оценку больше нельзя изменить.");
  }
  if (!Number.isInteger(value) || value < 0 || value > round.judgingMaxScore) {
    throw new ValidationFailedError(`Оценка должна быть целым числом от 0 до ${round.judgingMaxScore}.`);
  }

  const assignment = await prisma.judgeAssignment.findUnique({
    where: {
      divisionId_judgeUserId_role: { divisionId: round.division.id, judgeUserId: actor.userId, role: participant.role },
    },
  });
  if (!assignment) {
    throw new ValidationFailedError("Вы не назначены судить эту роль в этом дивизионе.");
  }

  await prisma.$transaction(async (tx) => {
    const existing = await tx.judgeScore.findUnique({
      where: { drawParticipantId_judgeAssignmentId: { drawParticipantId, judgeAssignmentId: assignment.id } },
    });
    if (existing && existing.clientSubmissionId === clientSubmissionId) {
      // Повтор той же самой офлайн-отправки (ретрай после потери связи) —
      // уже применена, ничего менять/аудировать не нужно.
      return;
    }
    await tx.judgeScore.upsert({
      where: { drawParticipantId_judgeAssignmentId: { drawParticipantId, judgeAssignmentId: assignment.id } },
      create: { drawParticipantId, judgeAssignmentId: assignment.id, value, maxValue: round.judgingMaxScore, clientSubmissionId },
      update: { value, maxValue: round.judgingMaxScore, clientSubmissionId },
    });
    await writeAudit(tx, {
      actor,
      action: existing ? "score.correct" : "score.submit",
      entityType: "JudgeScore",
      entityId: drawParticipantId,
      before: existing ? { value: existing.value } : undefined,
      after: { value },
    });
    await maybeFinalizeAfterScoreInTx(tx, round.id, actor);
  });
}

export type JudgeQueueItem = {
  drawParticipantId: string;
  divisionId: string;
  divisionName: string;
  roundId: string;
  heatId: string;
  heatNumber: number;
  role: RegistrationRole;
  bibNumber: string | null;
  displayName: string;
  myScore: number | null;
  maxValue: number;
};

// Что видит судья на своём мобильном экране: заходы дивизионов, на которые
// он назначен, которые уже идут/оттанцевали, но раунд ещё не закрыт —
// только его собственная роль (CLAUDE.md §40 — не перегружать судейский UI).
export async function getJudgeQueue(competitionId: string): Promise<JudgeQueueItem[]> {
  const actor = await requirePermission("score:submit", competitionId);

  const myAssignments = await prisma.judgeAssignment.findMany({
    where: { judgeUserId: actor.userId, division: { competitionId } },
  });
  if (myAssignments.length === 0) return [];
  const assignmentByKey = new Map(myAssignments.map((a) => [`${a.divisionId}:${a.role}`, a]));
  const divisionIds = [...new Set(myAssignments.map((a) => a.divisionId))];

  const heats = await prisma.heat.findMany({
    where: {
      status: { in: ["RUNNING", "PAUSED", "FINISHED"] },
      round: { divisionId: { in: divisionIds }, status: { in: ["RUNNING", "PAUSED", "FINISHED", "SCORING"] } },
    },
    // relationLoadStrategy: "join" — судья опрашивает эту функцию при
    // каждом обновлении своей страницы, вложенность до 5 уровней иначе
    // стоила бы отдельного round-trip'а на каждый (см. комментарий на
    // аналогичном запросе в admin/competitions/[id]/page.tsx).
    relationLoadStrategy: "join",
    include: {
      round: { select: { id: true, divisionId: true, judgingMaxScore: true, division: { select: { category: { select: { name: true } } } } } },
      draws: {
        orderBy: { version: "desc" },
        take: 1,
        include: {
          participants: {
            where: { scored: true },
            include: {
              registration: { include: { dancer: { select: { displayName: true } }, checkIn: { select: { bibNumber: true } } } },
              judgeScores: true,
            },
          },
        },
      },
    },
  });

  const items: JudgeQueueItem[] = [];
  for (const heat of heats) {
    const draw = heat.draws[0];
    if (!draw) continue;
    for (const p of draw.participants) {
      const assignment = assignmentByKey.get(`${heat.round.divisionId}:${p.role}`);
      if (!assignment) continue; // не моя роль в этом дивизионе
      const myScore = p.judgeScores.find((s) => s.judgeAssignmentId === assignment.id);
      items.push({
        drawParticipantId: p.id,
        divisionId: heat.round.divisionId,
        divisionName: heat.round.division.category.name,
        roundId: heat.round.id,
        heatId: heat.id,
        heatNumber: heat.number,
        role: p.role,
        bibNumber: p.registration.checkIn?.bibNumber ?? null,
        displayName: p.registration.dancer.displayName,
        myScore: myScore?.value ?? null,
        maxValue: heat.round.judgingMaxScore,
      });
    }
  }
  return items.sort((a, b) => a.heatNumber - b.heatNumber || Number(a.bibNumber ?? 0) - Number(b.bibNumber ?? 0));
}
