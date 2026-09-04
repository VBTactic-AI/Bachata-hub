import type { Prisma, RegistrationRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "../rbac/authorize";
import { writeAudit } from "../audit/audit";
import { ValidationFailedError } from "../errors";
import type { Actor } from "../rbac/actor";
import { fillHelperShortage } from "../competition/draw-engine";
import { parentRoundScoredRegistrationIds } from "./advancement";
import { rankFinalParticipants, resolveTieGroupPlaces, type FinalParticipantScores, type FinalCriterionPriority, type FinalTieGroup } from "./final-ranking";
import { allowedJudgeRole } from "./final-scoring-matrix";

type PrismaTx = Prisma.TransactionClient;
type CriterionSnapshot = { id: string; name: string; priority: number; minScore: number; maxScore: number; step: number };
type FinalTieGroupConfig = { finalTieGroupKey?: string; finalTieGroupRole?: RegistrationRole; finalTieGroupStartPlace?: number };

const ROLE_LABEL: Record<RegistrationRole, string> = { LEADER: "Ведущий", FOLLOWER: "Ведомый" };

export type FinalScoringProgress = { required: number; submitted: number; complete: boolean };

// Прогресс судейства финала — участник(scored=true) × судья его роли ×
// критерий. Финал НИКОГДА не пропускает судейство роли (в отличие от
// обычных раундов, advancement.ts rolesNotNeedingJudging) — "проходят N" в
// финале это места, не отсев (уже решено для обычного судейства, isFinalStageInTx).
export async function getFinalScoringProgressInTx(tx: PrismaTx | typeof prisma, roundId: string): Promise<FinalScoringProgress> {
  const round = await tx.round.findUniqueOrThrow({
    where: { id: roundId },
    select: { divisionId: true, finalSession: { select: { format: true, config: true, criteriaSnapshot: true } } },
  });
  if (!round.finalSession) return { required: 0, submitted: 0, complete: true };
  const criteria = round.finalSession.criteriaSnapshot as unknown as CriterionSnapshot[];

  const heats = await tx.heat.findMany({
    where: { roundId },
    select: {
      draws: { orderBy: { version: "desc" }, take: 1, select: { participants: { where: { scored: true }, select: { id: true, role: true } } } },
    },
  });
  const participants = heats.flatMap((h) => h.draws[0]?.participants ?? []);
  if (participants.length === 0 || criteria.length === 0) return { required: 0, submitted: 0, complete: true };

  const assignments = await tx.judgeAssignment.findMany({ where: { divisionId: round.divisionId }, select: { role: true } });
  const judgesByRole: Record<RegistrationRole, number> = { LEADER: 0, FOLLOWER: 0 };
  for (const a of assignments) judgesByRole[a.role]++;

  // Кто именно судит критерий — зависит от формата (allowedJudgeRole,
  // final-scoring-matrix.ts): в JUDGES_DANCE это не всегда судья ТОЙ ЖЕ
  // роли, что участник (там критерий "танцующего судьи" оценивает
  // противоположная роль) — считаем по каждому критерию отдельно, а не
  // просто "судьи роли участника × число критериев".
  let required = 0;
  for (const p of participants) {
    for (const c of criteria) {
      required += judgesByRole[allowedJudgeRole(c.id, p.role, round.finalSession.format, round.finalSession.config)];
    }
  }
  const participantIds = participants.map((p) => p.id);
  const submitted = participantIds.length === 0 ? 0 : await tx.finalJudgeScore.count({ where: { drawParticipantId: { in: participantIds } } });

  return { required, submitted, complete: submitted >= required };
}

export async function getFinalScoringProgress(roundId: string): Promise<FinalScoringProgress> {
  return getFinalScoringProgressInTx(prisma, roundId);
}

// Проверяет progress.complete целиком, а не только "нечего оценивать"
// (required===0) — required===0 подразумевает complete=true, так что это
// строго более точная проверка: если раунд ВОШЁЛ в SCORING уже полностью
// оценённым (все судьи успели отправить оценки, пока заход ещё шёл —
// найдено вживую 2026-09-04 при тестировании NORMAL: раунд иначе повисал в
// SCORING без единого лишнего клика, который бы досчитал результат),
// результат считается сразу, не дожидаясь следующей (несуществующей) заявки.
export async function maybeCalculateFinalOnEntryInTx(tx: PrismaTx, roundId: string, actor: Actor): Promise<void> {
  const progress = await getFinalScoringProgressInTx(tx, roundId);
  if (progress.complete) {
    await calculateFinalResultsInTx(tx, roundId, actor);
  }
}

export async function maybeFinalizeFinalAfterScoreInTx(tx: PrismaTx, roundId: string, actor: Actor): Promise<void> {
  const progress = await getFinalScoringProgressInTx(tx, roundId);
  if (progress.complete) {
    await calculateFinalResultsInTx(tx, roundId, actor);
  }
}

// Считает результат финала: суммирует оценки судей по каждому критерию для
// каждого вызванного (scored=true) участника, ранжирует ОТДЕЛЬНО по каждой
// роли (rankFinalParticipants, final-ranking.ts — сумма + лексикографический
// tie-break по priority, НЕ Relative Placement и НЕ weighted score). При
// полной ничье — НЕ выбирает место автоматически (CLAUDE.md §14/§19-20):
// создаёт служебный Round(type=TIE_BREAK) на каждую tie-группу, родительский
// раунд остаётся в SCORING, пока все группы не разрешены коллегиальным
// решением (recordFinalTieBreakDecision). Идемпотентно — если FinalResult
// уже посчитан, повторный вызов ничего не делает.
export async function calculateFinalResultsInTx(tx: PrismaTx, roundId: string, actor: Actor): Promise<void> {
  const already = await tx.finalResult.count({ where: { roundId } });
  if (already > 0) return;

  const round = await tx.round.findUniqueOrThrow({
    where: { id: roundId },
    relationLoadStrategy: "join",
    include: {
      finalSession: true,
      division: { select: { id: true, competitionId: true, category: { select: { order: true } } } },
    },
  });
  if (!round.finalSession) return; // не финал новой системы — считает обычный advancement.ts
  if (round.type === "TIE_BREAK") return; // решается только recordFinalTieBreakDecision, не автоматически
  // Считать можно только когда раунд ДЕЙСТВИТЕЛЬНО вошёл в SCORING (все
  // заходы завершены) — не раньше. Иначе для JUDGES_DANCE (заходы стадий
  // создаются по одной, не все сразу) возможна гонка: судьи успевают
  // полностью оценить стадию 1 ДО того, как стадия 2 вообще создана,
  // maybeFinalizeFinalAfterScoreInTx (вызывается после КАЖДОЙ оценки, вне
  // зависимости от статуса раунда) увидел бы "всё оценено" по неполному
  // набору заходов и посчитал бы результат только по одной роли — а
  // идемпотентная защита (already>0) выше не дала бы пересчитать его
  // правильно позже, когда появится вторая стадия (найдено вживую,
  // 2026-09-04).
  if (round.status !== "SCORING") return;

  const criteria = round.finalSession.criteriaSnapshot as unknown as CriterionSnapshot[];
  const priorities: FinalCriterionPriority[] = criteria.map((c) => ({ id: c.id, priority: c.priority }));

  const heats = await tx.heat.findMany({
    where: { roundId },
    select: {
      draws: {
        orderBy: { version: "desc" },
        take: 1,
        select: {
          participants: {
            where: { scored: true },
            select: { registrationId: true, role: true, finalJudgeScores: { select: { criterionId: true, value: true } } },
          },
        },
      },
    },
  });
  const rows = heats.flatMap((h) => h.draws[0]?.participants ?? []);

  const scoresByParticipant: FinalParticipantScores[] = rows.map((p) => {
    const criteriaTotals: Record<string, number> = {};
    for (const c of criteria) criteriaTotals[c.id] = 0;
    for (const s of p.finalJudgeScores) criteriaTotals[s.criterionId] = (criteriaTotals[s.criterionId] ?? 0) + s.value;
    return { registrationId: p.registrationId, role: p.role, criteriaTotals };
  });

  const resultRows: {
    registrationId: string;
    role: RegistrationRole;
    totalScore: number;
    criteriaTotals: Record<string, number>;
    place: number | null;
    tieGroupKey: string | null;
  }[] = [];
  const pendingTieGroups: { role: RegistrationRole; group: FinalTieGroup }[] = [];

  for (const role of ["LEADER", "FOLLOWER"] as const) {
    const roleParticipants = scoresByParticipant.filter((p) => p.role === role);
    if (roleParticipants.length === 0) continue;
    const { ranked, tieGroups } = rankFinalParticipants(roleParticipants, priorities);
    for (const r of ranked) {
      resultRows.push({ registrationId: r.registrationId, role, totalScore: r.totalScore, criteriaTotals: r.criteriaTotals, place: r.place, tieGroupKey: r.tieGroupKey });
    }
    for (const g of tieGroups) pendingTieGroups.push({ role, group: g });
  }

  if (resultRows.length > 0) {
    await tx.finalResult.createMany({
      data: resultRows.map((r) => ({
        roundId,
        registrationId: r.registrationId,
        finalSessionId: round.finalSession!.id,
        role: r.role,
        totalScore: r.totalScore,
        criteriaTotals: r.criteriaTotals,
        place: r.place,
        tieGroupKey: r.tieGroupKey,
      })),
    });
  }

  await writeAudit(tx, {
    actor,
    action: "final_result.calculate",
    entityType: "Round",
    entityId: roundId,
    after: {
      rankedCount: resultRows.filter((r) => r.place !== null).length,
      tieGroupsCount: pendingTieGroups.length,
    },
  });

  if (pendingTieGroups.length === 0) {
    await completeFinalRoundInTx(tx, round.id, round.statusVersion, round.finalSession.id, actor);
    return;
  }

  for (let i = 0; i < pendingTieGroups.length; i++) {
    await createFinalTieBreakRoundInTx(tx, round, pendingTieGroups[i].role, pendingTieGroups[i].group, i + 1, actor);
  }
  // Родительский раунд остаётся в SCORING — завершится, когда разрешится
  // последняя перетанцовка (recordFinalTieBreakDecision).
}

async function completeFinalRoundInTx(tx: PrismaTx, roundId: string, statusVersion: number, finalSessionId: string, actor: Actor): Promise<void> {
  const result = await tx.round.updateMany({
    where: { id: roundId, status: "SCORING", statusVersion },
    data: { status: "COMPLETED", statusVersion: { increment: 1 }, endedAt: new Date() },
  });
  if (result.count === 0) return; // уже завершён кем-то/чем-то другим
  await tx.finalSession.update({ where: { id: finalSessionId }, data: { completedAt: new Date() } });
  await writeAudit(tx, {
    actor,
    action: "round.transition",
    entityType: "Round",
    entityId: roundId,
    before: { status: "SCORING" },
    after: { status: "COMPLETED" },
    reason: "Финал завершён — все места определены без полной ничьей.",
  });
}

// Вставляет служебный раунд-перетанцовку финала сразу после родителя,
// сдвигая более поздние раунды на 1 (тот же приём, что и advancement.ts для
// обычных раундов). tieGroupKey/role/startPlace сохраняются в Round.config
// (уже существующее generic JSON-поле — используется для drawCallOrder и
// т.п., новых полей в схеме не потребовалось) — recordFinalTieBreakDecision
// восстанавливает по ним, какую именно tie-группу решает этот раунд.
async function createFinalTieBreakRoundInTx(
  tx: PrismaTx,
  parentRound: { id: string; divisionId: string; order: number; rulesId: string; division: { id: string; competitionId: string; category: { order: number } } },
  role: RegistrationRole,
  group: FinalTieGroup,
  offset: number,
  actor: Actor
): Promise<void> {
  const insertOrder = parentRound.order + offset;
  const laterRounds = await tx.round.findMany({ where: { divisionId: parentRound.divisionId, order: { gte: insertOrder } }, orderBy: { order: "desc" } });
  for (const r of laterRounds) {
    await tx.round.update({ where: { id: r.id }, data: { order: r.order + 1 } });
  }

  const config: FinalTieGroupConfig = { finalTieGroupKey: group.key, finalTieGroupRole: role, finalTieGroupStartPlace: group.startPlace };
  const tieBreakRound = await tx.round.create({
    data: {
      divisionId: parentRound.divisionId,
      type: "TIE_BREAK",
      order: insertOrder,
      status: "DRAW_LOCKED",
      finalistsCount: group.registrationIds.length,
      heatCapacity: Math.max(group.registrationIds.length, 2),
      rulesId: parentRound.rulesId,
      tieBreakOfRoundId: parentRound.id,
      config: config as unknown as Prisma.InputJsonValue,
    },
  });
  const heat = await tx.heat.create({ data: { roundId: tieBreakRound.id, number: 1 } });
  const draw = await tx.draw.create({
    data: {
      heatId: heat.id,
      version: 1,
      seed: null,
      algorithmVersion: "v1",
      createdById: actor.userId,
      reason: `Автоматически сформировано: полная ничья финала (роль ${ROLE_LABEL[role]}) — общая сумма и все критерии совпали, требуется коллегиальное решение судей.`,
    },
  });

  const tieRows = group.registrationIds.map((registrationId, i) => ({ drawId: draw.id, registrationId, role, scored: true, calledOrder: i + 1 }));

  const opposingRole: RegistrationRole = role === "LEADER" ? "FOLLOWER" : "LEADER";
  const parentScoredIds = await parentRoundScoredRegistrationIds(tx, parentRound.id);
  for (const id of group.registrationIds) parentScoredIds.delete(id);

  const helpers = await fillHelperShortage(tx, {
    competitionId: parentRound.division.competitionId,
    divisionId: parentRound.divisionId,
    categoryOrder: parentRound.division.category.order,
    role: opposingRole,
    count: group.registrationIds.length,
    alreadyScoredIds: parentScoredIds,
    preferOwnFirst: true,
  });
  const helperRows = helpers.map((helper, i) => ({
    drawId: draw.id,
    registrationId: helper.registrationId,
    role: opposingRole,
    scored: false,
    helperSource: helper.helperSource,
    calledOrder: tieRows.length + i + 1,
  }));
  await tx.drawParticipant.createMany({ data: [...tieRows, ...helperRows] });

  await writeAudit(tx, {
    actor,
    action: "final_tie_break.create",
    entityType: "Round",
    entityId: tieBreakRound.id,
    after: {
      tieBreakOfRoundId: parentRound.id,
      role,
      tieGroupKey: group.key,
      startPlace: group.startPlace,
      registrationIds: group.registrationIds,
      helperRegistrationIds: helpers.map((h) => h.registrationId),
    },
    reason: "Полная ничья в финале (общая сумма и все критерии по приоритету совпали) — CLAUDE.md §14/§19-20 запрещает выбирать места автоматически.",
  });
}

// RANK_ALL (CLAUDE.md §22) — судьи вслух коллегиально расставили ВСЮ
// tie-группу по местам (не выбор N прошедших, как в обычной перетанцовке
// advancement.ts recordTieBreakDecision — в финале у всех участников группы
// уже есть место, нужно только разрешить порядок внутри группы).
export async function recordFinalTieBreakDecision(tieBreakRoundId: string, orderedRegistrationIds: string[]): Promise<void> {
  const tieBreakRound = await prisma.round.findUniqueOrThrow({
    where: { id: tieBreakRoundId },
    include: { division: { select: { competitionId: true } }, tieBreakOfRound: { include: { finalSession: true } } },
  });
  if (tieBreakRound.type !== "TIE_BREAK" || !tieBreakRound.tieBreakOfRound) {
    throw new ValidationFailedError("Это не раунд-перетанцовка.");
  }
  const parentRound = tieBreakRound.tieBreakOfRound;
  if (!parentRound.finalSession) {
    throw new ValidationFailedError("Это перетанцовка обычного раунда — для неё используется другое действие (recordTieBreakDecision).");
  }
  const competitionId = tieBreakRound.division.competitionId;
  const actor = await requirePermission("tie_break:decide", competitionId);

  if (tieBreakRound.status !== "SCORING") {
    throw new ValidationFailedError('Решение можно внести только после того, как заход перетанцовки оттанцевал (статус "Подсчёт баллов").');
  }

  const config = (tieBreakRound.config as unknown as FinalTieGroupConfig) ?? {};
  if (!config.finalTieGroupKey || !config.finalTieGroupRole || config.finalTieGroupStartPlace === undefined) {
    throw new ValidationFailedError("У этой перетанцовки не сохранён ключ tie-группы — некорректное состояние.");
  }

  const parentResults = await prisma.finalResult.findMany({ where: { roundId: parentRound.id, tieGroupKey: config.finalTieGroupKey } });
  if (parentResults.length === 0) throw new ValidationFailedError("Соответствующая tie-группа не найдена в результатах родительского раунда.");

  const group: FinalTieGroup = {
    key: config.finalTieGroupKey,
    startPlace: config.finalTieGroupStartPlace,
    registrationIds: parentResults.map((r) => r.registrationId),
  };
  // resolveTieGroupPlaces — чистая функция (final-ranking.ts), бросает
  // обычный Error при несовпадении состава — переводим в ValidationFailedError
  // здесь, на границе с доменным слоем, чтобы respondToDomainError() не
  // завернул понятную причину в общий "Внутренняя ошибка сервера" (CLAUDE.md §46).
  let placements: { registrationId: string; place: number }[];
  try {
    placements = resolveTieGroupPlaces(group, orderedRegistrationIds);
  } catch (e) {
    throw new ValidationFailedError(e instanceof Error ? e.message : "Некорректный порядок участников.");
  }

  const heat = await prisma.heat.findFirstOrThrow({ where: { roundId: tieBreakRoundId } });
  const draw = await prisma.draw.findFirstOrThrow({ where: { heatId: heat.id }, orderBy: { version: "desc" }, include: { participants: true } });
  const realIds = new Set(draw.participants.filter((p) => p.scored).map((p) => p.registrationId));
  for (const id of orderedRegistrationIds) {
    if (!realIds.has(id)) throw new ValidationFailedError("В порядке есть участник, которого не было в этой перетанцовке.");
  }

  const criteriaTotalsByReg = new Map(parentResults.map((r) => [r.registrationId, r.criteriaTotals]));
  const totalScoreByReg = new Map(parentResults.map((r) => [r.registrationId, r.totalScore]));

  await prisma.$transaction(async (tx) => {
    for (const placement of placements) {
      await tx.finalResult.update({
        where: { roundId_registrationId: { roundId: parentRound.id, registrationId: placement.registrationId } },
        data: { place: placement.place, tieGroupKey: null },
      });
      // Собственный FinalResult у самой перетанцовки — CLAUDE.md §21
      // ("TieBreakRound должен иметь полноценные данные"), по аналогии с
      // обычной перетанцовкой advancement.ts.
      await tx.finalResult.upsert({
        where: { roundId_registrationId: { roundId: tieBreakRoundId, registrationId: placement.registrationId } },
        create: {
          roundId: tieBreakRoundId,
          registrationId: placement.registrationId,
          finalSessionId: parentRound.finalSession!.id,
          role: config.finalTieGroupRole!,
          totalScore: totalScoreByReg.get(placement.registrationId) ?? 0,
          criteriaTotals: (criteriaTotalsByReg.get(placement.registrationId) ?? {}) as unknown as Prisma.InputJsonValue,
          place: placement.place,
        },
        update: { place: placement.place },
      });
    }

    await tx.round.update({ where: { id: tieBreakRoundId }, data: { status: "COMPLETED", statusVersion: { increment: 1 }, endedAt: new Date() } });
    await writeAudit(tx, {
      actor,
      action: "final_tie_break.decide",
      entityType: "Round",
      entityId: tieBreakRoundId,
      after: { placements },
    });

    // Если у родительского раунда не осталось других нерешённых
    // перетанцовок (напр. вторая — по противоположной роли) — родитель
    // тоже завершён.
    const stillPendingRounds = await tx.round.count({ where: { tieBreakOfRoundId: parentRound.id, status: { not: "COMPLETED" } } });
    if (stillPendingRounds === 0) {
      const stillPendingGroups = await tx.finalResult.count({ where: { roundId: parentRound.id, place: null } });
      if (stillPendingGroups === 0) {
        await completeFinalRoundInTx(tx, parentRound.id, parentRound.statusVersion, parentRound.finalSession!.id, actor);
      }
    }
  });
}
