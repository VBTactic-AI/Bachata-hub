import type { RegistrationRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "../rbac/authorize";
import { writeAudit } from "../audit/audit";
import { ValidationFailedError } from "../errors";
import { isFinalStageInTx, maybeFinalizeAfterScoreInTx, rolesNotNeedingJudging } from "./advancement";

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

// Раунд/роль, где судья назначен, но оценивать не нужно — участников этой
// роли не больше, чем мест, все проходят дальше сами (по запросу
// пользователя, 2026-09-04). Показывается судье явным сообщением, а не
// молчаливым отсутствием пунктов в списке — иначе не отличить "оценивать
// нечего" от "судью забыли назначить"/"ещё не привезли участников".
export type JudgeQueueSkippedNotice = {
  roundId: string;
  divisionName: string;
  role: RegistrationRole;
};

export type JudgeQueue = { items: JudgeQueueItem[]; skippedNotices: JudgeQueueSkippedNotice[] };

// Что видит судья на своём мобильном экране: заходы дивизионов, на которые
// он назначен, которые уже идут/оттанцевали, но раунд ещё не закрыт —
// только его собственная роль (CLAUDE.md §40 — не перегружать судейский UI).
export async function getJudgeQueue(competitionId: string): Promise<JudgeQueue> {
  const actor = await requirePermission("score:submit", competitionId);

  const myAssignments = await prisma.judgeAssignment.findMany({
    where: { judgeUserId: actor.userId, division: { competitionId } },
  });
  if (myAssignments.length === 0) return { items: [], skippedNotices: [] };
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
      round: {
        select: {
          id: true,
          divisionId: true,
          judgingMaxScore: true,
          finalistsCount: true,
          order: true,
          type: true,
          division: { select: { category: { select: { name: true } } } },
        },
      },
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
  if (heats.length === 0) return { items: [], skippedNotices: [] };

  // Порог "участников <= мест" нужно считать по ВСЕМ заходам раунда, а не
  // только по уже загруженным выше (в статусе RUNNING/PAUSED/FINISHED) —
  // если у раунда несколько заходов и не все ещё стартовали, их участники
  // всё равно входят в общий итог по роли.
  const roundIds = [...new Set(heats.map((h) => h.round.id))];
  const allHeatsOfRounds = await prisma.heat.findMany({
    where: { roundId: { in: roundIds } },
    select: {
      roundId: true,
      draws: { orderBy: { version: "desc" }, take: 1, select: { participants: { where: { scored: true }, select: { role: true } } } },
    },
  });
  const roleCountByRound = new Map<string, Record<RegistrationRole, number>>();
  for (const h of allHeatsOfRounds) {
    const counts = roleCountByRound.get(h.roundId) ?? { LEADER: 0, FOLLOWER: 0 };
    for (const p of h.draws[0]?.participants ?? []) counts[p.role]++;
    roleCountByRound.set(h.roundId, counts);
  }

  const isFinalByRound = new Map<string, boolean>();
  const items: JudgeQueueItem[] = [];
  const skippedNotices: JudgeQueueSkippedNotice[] = [];
  const noticeKeys = new Set<string>();

  for (const heat of heats) {
    const draw = heat.draws[0];
    if (!draw) continue;

    let isFinal = isFinalByRound.get(heat.round.id);
    if (isFinal === undefined) {
      isFinal = await isFinalStageInTx(prisma, heat.round.divisionId, heat.round.order);
      isFinalByRound.set(heat.round.id, isFinal);
    }
    const counts = roleCountByRound.get(heat.round.id) ?? { LEADER: 0, FOLLOWER: 0 };
    const skippedRoles = rolesNotNeedingJudging(counts, heat.round.finalistsCount ?? 0, isFinal, heat.round.type);

    for (const role of skippedRoles) {
      if (!assignmentByKey.has(`${heat.round.divisionId}:${role}`)) continue; // судья не назначен на эту роль — уведомление ему ни к чему
      const key = `${heat.round.id}:${role}`;
      if (!noticeKeys.has(key)) {
        noticeKeys.add(key);
        skippedNotices.push({ roundId: heat.round.id, divisionName: heat.round.division.category.name, role });
      }
    }

    for (const p of draw.participants) {
      if (skippedRoles.has(p.role)) continue; // не оценивается — не показываем в списке
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

  return {
    items: items.sort((a, b) => a.heatNumber - b.heatNumber || Number(a.bibNumber ?? 0) - Number(b.bibNumber ?? 0)),
    skippedNotices,
  };
}
