import type { FinalFormat, RegistrationRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "../rbac/authorize";
import { writeAudit } from "../audit/audit";
import { ValidationFailedError } from "../errors";
import { maybeFinalizeFinalAfterScoreInTx } from "./final-advancement";
import { allowedJudgeRole, countRequiredForJudgeRole } from "./final-scoring-matrix";

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
  const finalFormat = round.finalSession.format; // локальная копия — TS не сужает round.finalSession внутри замыкания $transaction ниже
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
    throw new ValidationFailedError("Вы не назначены оценивать этот критерий у этого участника в этой категории.");
  }

  // Судья уже нажал "Готово" по этому раунду (confirmFinalJudgeRoundDone) —
  // его оценки зафиксированы, даже если финал ещё ждёт других судей
  // (2026-09-07, по образцу обычных раундов, scoring.ts).
  const myConfirmation = await prisma.judgeRoundConfirmation.findUnique({
    where: { roundId_judgeAssignmentId: { roundId: round.id, judgeAssignmentId: assignment.id } },
  });
  if (myConfirmation) {
    throw new ValidationFailedError('Вы уже нажали "Готово" по этому раунду — оценки зафиксированы, менять их больше нельзя.');
  }

  await prisma.$transaction(async (tx) => {
    // SCORE-001: тот же случай, что и в scoring.ts — раунд остаётся в SCORING,
    // пока не решена перетанцовка ДРУГОЙ роли, и правка оценки уже
    // посчитанного участника молча ни на что не повлияет.
    const existingResult = await tx.finalResult.findUnique({
      where: { roundId_registrationId: { roundId: round.id, registrationId: participant.registrationId } },
    });
    if (existingResult) {
      throw new ValidationFailedError("Результат по этому участнику уже посчитан — оценку больше нельзя изменить.");
    }
    const existing = await tx.finalJudgeScore.findUnique({
      where: { drawParticipantId_judgeAssignmentId_criterionId: { drawParticipantId, judgeAssignmentId: assignment.id, criterionId } },
    });
    if (existing && existing.clientSubmissionId === clientSubmissionId) {
      return; // повтор той же офлайн-отправки — уже применена
    }

    // RELATIVE_PLACEMENT (скейтинг-система) — судья ставит МЕСТО, а не
    // баллы: два разных участника одной роли не могут получить от ОДНОГО
    // судьи одно и то же место (final-ranking.ts, rankFinalParticipantsBySkatingSystem
    // ожидает на входе честную расстановку 1..N без повторов). Обычные
    // критериальные форматы такого ограничения не имеют — там равные баллы
    // у разных участников — нормальная ситуация.
    //
    // Атомарная подмена (промт пользователя, 2026-09-07): если запрошенное
    // место уже занято другим участником той же роли, прежний обладатель
    // МЕСТА НЕ отклоняет отправку ошибкой — он атомарно освобождается
    // (запись удаляется, участник становится "без места") в ТОЙ ЖЕ
    // транзакции, что и назначение нового значения. Судья видит освобождение
    // сразу в своём списке (оптимистично на клиенте, FinalJudgingScreen.tsx,
    // и подтверждённо — после router.refresh()). Полный обмен местами между
    // двумя участниками (101↔102) — не отдельная операция, а естественный
    // результат применения этой же атомарной подмены дважды подряд: первый
    // вызов освобождает место, которое тут же занимает второй вызов; на
    // каждом шаге данные остаются полностью консистентны (нет транзитного
    // состояния с двумя обладателями одного места).
    if (finalFormat === "RELATIVE_PLACEMENT") {
      // Конкурентная защита (CLAUDE.md §34): "проверить, что место свободно,
      // потом записать" само по себе НЕ атомарно между двумя ОДНОВРЕМЕННЫМИ
      // запросами (две вкладки одного судьи, повтор из офлайн-очереди вперегонки
      // со свежей отправкой) — оба могли бы увидеть "место свободно" до commit
      // друг друга и в итоге дать двум разным участникам одно и то же место
      // (найдено вживую, 2026-09-07: "у главного судьи в финальной таблице
      // одинаковые значения" — реальный дубликат в БД, а не просто заставший
      // старое значение монитор). Advisory xact-lock сериализует ровно эту
      // пару (судья × критерий) — конкурентный вызов просто ждёт своей очереди
      // вместо гонки, снимается сам в конце транзакции.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${assignment.id}), hashtext(${criterionId}))`;

      const heats = await tx.heat.findMany({
        where: { roundId: round.id },
        select: {
          draws: {
            orderBy: { version: "desc" },
            take: 1,
            select: { participants: { where: { scored: true, role: participant.role }, select: { id: true } } },
          },
        },
      });
      const sameRoleIds = heats
        .flatMap((h) => h.draws[0]?.participants ?? [])
        .map((p) => p.id)
        .filter((id) => id !== drawParticipantId);
      if (sameRoleIds.length > 0) {
        const clash = await tx.finalJudgeScore.findFirst({
          where: { judgeAssignmentId: assignment.id, criterionId, value, drawParticipantId: { in: sameRoleIds } },
        });
        if (clash) {
          await tx.finalJudgeScore.delete({ where: { id: clash.id } });
          await writeAudit(tx, {
            actor,
            action: "final_score.displace",
            entityType: "FinalJudgeScore",
            entityId: clash.drawParticipantId,
            before: { criterionId, value: clash.value },
            after: null,
            reason: `Место ${value} переставлено участнику ${drawParticipantId}`,
          });
        }
      }
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

// Судья явно нажимает "Готово" по финалу — по образцу обычных раундов
// (confirmJudgeRoundDone, scoring.ts, A21): свободно ставит/меняет оценки
// сколько угодно, но финал не ждёт от него явного заполнения последней
// клетки и не завершается сам по первому попавшемуся моменту, когда всё
// собрано (иначе случайный лишний клик мог бы мгновенно и необратимо
// завершить финал — определить места, которые уже не поправить иначе как
// через correction workflow). Принимается, только если у судьи заполнены
// ВСЕ обязательные клетки (участник × критерий его роли) — иначе понятная
// ошибка, ничего не фиксируется. Судья, назначенный на обе роли одного
// дивизиона (JUDGES_DANCE), — одно нажатие подтверждает обе, только если
// ОБЕ уже готовы.
export async function confirmFinalJudgeRoundDone(roundId: string): Promise<void> {
  const round = await prisma.round.findUniqueOrThrow({
    where: { id: roundId },
    include: {
      division: { select: { id: true, competitionId: true } },
      finalSession: { select: { format: true, config: true, criteriaSnapshot: true } },
    },
  });
  const competitionId = round.division.competitionId;
  const actor = await requirePermission("score:submit", competitionId);

  if (!round.finalSession) {
    throw new ValidationFailedError("У этого раунда ещё не начат финал.");
  }
  if (round.status === "COMPLETED") {
    throw new ValidationFailedError("Финал уже завершён.");
  }
  const finalSession = round.finalSession;

  const myAssignments = await prisma.judgeAssignment.findMany({
    where: { divisionId: round.division.id, judgeUserId: actor.userId },
  });
  if (myAssignments.length === 0) {
    throw new ValidationFailedError("Вы не назначены судить эту категорию.");
  }

  const criteria = finalSession.criteriaSnapshot as unknown as CriterionSnapshot[];
  const heats = await prisma.heat.findMany({
    where: { roundId },
    select: {
      draws: {
        orderBy: { version: "desc" },
        take: 1,
        select: {
          participants: {
            where: { scored: true },
            select: { role: true, finalJudgeScores: { select: { judgeAssignmentId: true, criterionId: true } } },
          },
        },
      },
    },
  });
  const participants = heats.flatMap((h) => h.draws[0]?.participants ?? []);

  await prisma.$transaction(async (tx) => {
    for (const assignment of myAssignments) {
      const already = await tx.judgeRoundConfirmation.findUnique({
        where: { roundId_judgeAssignmentId: { roundId, judgeAssignmentId: assignment.id } },
      });
      if (already) continue; // эта роль уже подтверждена раньше — молча пропускаем, не ошибка

      const required = countRequiredForJudgeRole(participants, criteria, finalSession.format, finalSession.config, assignment.role);
      if (required === 0) continue; // нечего подтверждать для этой роли (напр. JUDGES_DANCE без "танцующих" критериев)

      const submitted = participants.reduce((sum, p) => {
        return (
          sum +
          criteria.filter(
            (c) =>
              allowedJudgeRole(c.id, p.role, finalSession.format, finalSession.config) === assignment.role &&
              p.finalJudgeScores.some((s) => s.judgeAssignmentId === assignment.id && s.criterionId === c.id)
          ).length
        );
      }, 0);

      if (submitted !== required) {
        const roleLabel = assignment.role === "LEADER" ? "Партнёры" : "Партнёрши";
        throw new ValidationFailedError(
          `${roleLabel}: оценено ${submitted} из ${required} — сначала оцените всех участников по всем критериям, прежде чем нажать "Готово".`
        );
      }

      const created = await tx.judgeRoundConfirmation.create({
        data: { roundId, judgeAssignmentId: assignment.id, yesCount: submitted },
      });
      await writeAudit(tx, {
        actor,
        action: "final_judge.confirm_round",
        entityType: "JudgeRoundConfirmation",
        entityId: created.id,
        after: { roundId, judgeAssignmentId: assignment.id, role: assignment.role, submitted, required },
      });
    }

    await maybeFinalizeFinalAfterScoreInTx(tx, roundId, actor);
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
  format: FinalFormat;
  criteria: CriterionSnapshot[]; // отсортированы по priority
  items: FinalJudgeQueueItem[]; // только участники МОЕЙ роли
  scoredCount: number;
  totalCount: number;
  // Уже нажал(а) "Готово" по ВСЕМ своим ролям в этом раунде
  // (confirmFinalJudgeRoundDone) — 2026-09-07.
  confirmed: boolean;
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

  // "Готово" по ВСЕМ моим назначениям, у которых вообще есть что оценивать
  // в этом раунде (роль без работы, напр. JUDGES_DANCE без "танцующих"
  // критериев, не в счёт) — то же правило, что и в confirmFinalJudgeRoundDone.
  const relevantAssignmentIds = myAssignments
    .filter((a) => countRequiredForJudgeRole(items.map((it) => ({ role: it.role })), criteria, format, config, a.role) > 0)
    .map((a) => a.id);
  const myConfirmedIds =
    relevantAssignmentIds.length === 0
      ? new Set<string>()
      : new Set(
          (
            await prisma.judgeRoundConfirmation.findMany({
              where: { roundId, judgeAssignmentId: { in: relevantAssignmentIds } },
              select: { judgeAssignmentId: true },
            })
          ).map((c) => c.judgeAssignmentId)
        );
  const confirmed = relevantAssignmentIds.length > 0 && relevantAssignmentIds.every((id) => myConfirmedIds.has(id));

  return {
    roundId,
    divisionName: round.division.category.name,
    format: round.finalSession.format,
    criteria,
    items,
    scoredCount,
    totalCount: items.length,
    confirmed,
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
    select: {
      id: true,
      division: { select: { category: { select: { name: true } } } },
      // Пока не решена перетанцовка за место (FULL_RANK/RANK_ALL,
      // TIEBREAK-001/A22) — на экране самого финала уже нечего оценивать
      // (SCORE-001 блокирует правку посчитанных участников), а реальное
      // решение вносит HEAD_JUDGE отдельной формой (реордер), не судья.
      // Приглашать судью "открыть финал" в этот момент только сбивает с
      // толку (2026-09-07, по запросу пользователя) — скрываем раунд из
      // списка, пока висит хоть одна незавершённая перетанцовка.
      tieBreakRounds: { where: { status: { not: "COMPLETED" } }, select: { id: true } },
    },
  });

  return rounds
    .filter((r) => r.tieBreakRounds.length === 0)
    .map((r) => ({ roundId: r.id, divisionName: r.division.category.name }));
}
