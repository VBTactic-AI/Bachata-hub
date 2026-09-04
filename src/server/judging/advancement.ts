import type { Prisma, RegistrationRole, Round } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "../rbac/authorize";
import { writeAudit } from "../audit/audit";
import { ValidationFailedError } from "../errors";
import type { Actor } from "../rbac/actor";
import { fillHelperShortage } from "../competition/draw-engine";

type PrismaTx = Prisma.TransactionClient;

type ScoredParticipant = { id: string; registrationId: string; role: RegistrationRole; scoreSum: number };

// Разбивает участников одной роли на "чисто прошли" / "спорная граница
// (ничья)" / "чисто не прошли" — сравнение только по одной роли: N (сколько
// проходит дальше) на движке — это количество ЛЮДЕЙ КАЖДОЙ РОЛИ ("проходят N
// пар" в UI), не общий cutoff по всем вместе (иначе лидеры и ведомые могли бы
// пройти в разном количестве, и пары для следующего раунда никак не
// сложились бы). CLAUDE.md §20/§23 — нельзя просто обрезать список без
// обработки ничьей.
function splitByCutoff(
  participants: ScoredParticipant[],
  finalistsCount: number
): { advanced: ScoredParticipant[]; tieGroup: ScoredParticipant[]; eliminated: ScoredParticipant[] } {
  const sorted = [...participants].sort((a, b) => b.scoreSum - a.scoreSum);
  if (sorted.length <= finalistsCount) {
    return { advanced: sorted, tieGroup: [], eliminated: [] };
  }
  const cutoffScore = sorted[finalistsCount - 1].scoreSum;
  const advanced = sorted.filter((p) => p.scoreSum > cutoffScore);
  const tieGroup = sorted.filter((p) => p.scoreSum === cutoffScore);
  const eliminated = sorted.filter((p) => p.scoreSum < cutoffScore);
  const remainingSpots = finalistsCount - advanced.length;
  if (tieGroup.length <= remainingSpots) {
    // Ничья ровно на границе, но мест хватает на всех — никакой
    // неоднозначности нет, все из tieGroup тоже проходят чисто.
    return { advanced: [...advanced, ...tieGroup], tieGroup: [], eliminated };
  }
  return { advanced, tieGroup, eliminated };
}

type PendingTieBreak = { role: RegistrationRole; group: ScoredParticipant[]; remainingSpots: number };

// Считает результат раунда: суммирует оценки судей по каждому вызванному
// (scored=true) участнику, определяет проходящих отдельно по каждой роли,
// пишет RoundResult. При ничье на границе — не выбирает молча (CLAUDE.md
// §19-20, §60): создаёт служебный Round(type=TIE_BREAK) со своим заходом,
// round остаётся в SCORING, пока перетанцовка не разрешится явным решением
// (recordTieBreakDecision). Идемпотентно — если RoundResult уже посчитан,
// повторный вызов ничего не делает.
export async function calculateRoundResultsInTx(tx: PrismaTx, roundId: string, actor: Actor): Promise<void> {
  const already = await tx.roundResult.count({ where: { roundId } });
  if (already > 0) return;

  const round = await tx.round.findUniqueOrThrow({
    where: { id: roundId },
    relationLoadStrategy: "join",
    include: { division: { select: { id: true, competitionId: true, category: { select: { order: true } } } } },
  });
  if (round.type === "TIE_BREAK") return; // решается только recordTieBreakDecision, не автоматически

  const heats = await tx.heat.findMany({
    where: { roundId },
    select: {
      draws: {
        orderBy: { version: "desc" },
        take: 1,
        select: {
          participants: {
            where: { scored: true },
            select: { id: true, registrationId: true, role: true, judgeScores: { select: { value: true } } },
          },
        },
      },
    },
  });
  const rows = heats.flatMap((h) => h.draws[0]?.participants ?? []);
  const scored: ScoredParticipant[] = rows.map((p) => ({
    id: p.id,
    registrationId: p.registrationId,
    role: p.role,
    scoreSum: p.judgeScores.reduce((sum, s) => sum + s.value, 0),
  }));

  const finalistsCount = round.finalistsCount ?? scored.length;
  const leaders = splitByCutoff(
    scored.filter((p) => p.role === "LEADER"),
    finalistsCount
  );
  const followers = splitByCutoff(
    scored.filter((p) => p.role === "FOLLOWER"),
    finalistsCount
  );

  const resultRows: { registrationId: string; scoreSum: number; rank: number; status: "ADVANCED" | "ELIMINATED" | "TIE_BREAK_REQUIRED" }[] = [];
  for (const side of [leaders, followers]) {
    const sortedAll = [...side.advanced, ...side.tieGroup, ...side.eliminated].sort((a, b) => b.scoreSum - a.scoreSum);
    sortedAll.forEach((p, idx) => {
      const status = side.advanced.includes(p) ? "ADVANCED" : side.tieGroup.includes(p) ? "TIE_BREAK_REQUIRED" : "ELIMINATED";
      resultRows.push({ registrationId: p.registrationId, scoreSum: p.scoreSum, rank: idx + 1, status });
    });
  }

  if (resultRows.length > 0) {
    await tx.roundResult.createMany({
      data: resultRows.map((r) => ({ roundId, registrationId: r.registrationId, scoreSum: r.scoreSum, rank: r.rank, status: r.status })),
    });
  }

  await writeAudit(tx, {
    actor,
    action: "result.calculate",
    entityType: "Round",
    entityId: roundId,
    after: {
      advancedCount: resultRows.filter((r) => r.status === "ADVANCED").length,
      eliminatedCount: resultRows.filter((r) => r.status === "ELIMINATED").length,
      tieBreakCount: resultRows.filter((r) => r.status === "TIE_BREAK_REQUIRED").length,
    },
  });

  const pending: PendingTieBreak[] = [];
  if (leaders.tieGroup.length > 0) pending.push({ role: "LEADER", group: leaders.tieGroup, remainingSpots: finalistsCount - leaders.advanced.length });
  if (followers.tieGroup.length > 0)
    pending.push({ role: "FOLLOWER", group: followers.tieGroup, remainingSpots: finalistsCount - followers.advanced.length });

  if (pending.length === 0) {
    // Ничьей не было — раунд полностью завершён прямо сейчас.
    await completeRoundInTx(tx, round, actor);
    return;
  }

  for (let i = 0; i < pending.length; i++) {
    await createTieBreakRoundInTx(tx, round, pending[i], i + 1, actor);
  }
  // round остаётся в SCORING — завершится, когда разрешится последняя
  // перетанцовка (recordTieBreakDecision).
}

async function completeRoundInTx(tx: PrismaTx, round: Round, actor: Actor): Promise<void> {
  const result = await tx.round.updateMany({
    where: { id: round.id, status: "SCORING", statusVersion: round.statusVersion },
    data: { status: "COMPLETED", statusVersion: { increment: 1 }, endedAt: new Date() },
  });
  if (result.count === 0) return; // уже завершён кем-то/чем-то другим
  await writeAudit(tx, {
    actor,
    action: "round.transition",
    entityType: "Round",
    entityId: round.id,
    before: { status: "SCORING" },
    after: { status: "COMPLETED" },
    reason: "Все результаты определены — проходящие набраны без ничьей на границе.",
  });
}

// Вставляет служебный раунд-перетанцовку сразу после родительского в
// последовательности дивизиона, сдвигая более поздние раунды на 1 (по
// одному, от последнего к первому — чтобы не столкнуться с
// @@unique([divisionId, order]) в процессе сдвига). offset — 1 для первой
// перетанцовки этого расчёта, 2 для второй (если ничья сразу на обеих
// ролях) — так они не конкурируют за одно и то же место в очереди.
async function createTieBreakRoundInTx(
  tx: PrismaTx,
  parentRound: Round & { division: { id: string; competitionId: string; category: { order: number } } },
  tie: PendingTieBreak,
  offset: number,
  actor: Actor
): Promise<void> {
  const insertOrder = parentRound.order + offset;
  const laterRounds = await tx.round.findMany({
    where: { divisionId: parentRound.divisionId, order: { gte: insertOrder } },
    orderBy: { order: "desc" },
  });
  for (const r of laterRounds) {
    await tx.round.update({ where: { id: r.id }, data: { order: r.order + 1 } });
  }

  const tieBreakRound = await tx.round.create({
    data: {
      divisionId: parentRound.divisionId,
      type: "TIE_BREAK",
      order: insertOrder,
      status: "DRAW_LOCKED",
      finalistsCount: tie.remainingSpots,
      heatCapacity: Math.max(tie.group.length, 2),
      rulesId: parentRound.rulesId,
      tieBreakOfRoundId: parentRound.id,
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
      reason: `Автоматически сформировано: ничья на границе прохода (роль ${tie.role === "LEADER" ? "Ведущий" : "Ведомый"}).`,
    },
  });

  const tieRows = tie.group.map((p, i) => ({
    drawId: draw.id,
    registrationId: p.registrationId,
    role: tie.role,
    scored: true,
    calledOrder: i + 1,
  }));

  // Не хватает пары — добираем помощников противоположной роли, сначала
  // свои уже станцевавшие В РОДИТЕЛЬСКОМ раунде (они уже свободны — либо
  // явно прошли/не прошли, либо ждут решения по своей стороне), потом
  // категории строго выше (preferOwnFirst=true, подтверждено пользователем
  // 2026-09-04).
  const opposingRole: RegistrationRole = tie.role === "LEADER" ? "FOLLOWER" : "LEADER";
  const parentScoredIds = await parentRoundScoredRegistrationIds(tx, parentRound.id);
  for (const p of tie.group) parentScoredIds.delete(p.registrationId);

  const helpers = await fillHelperShortage(tx, {
    competitionId: parentRound.division.competitionId,
    divisionId: parentRound.divisionId,
    categoryOrder: parentRound.division.category.order,
    role: opposingRole,
    count: tie.group.length,
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
  // Один batch-insert на весь состав перетанцовки (тай-группа + помощники) —
  // тот же приём, что и в draw-engine.ts formDrawInTx: на удалённой БД
  // каждый round-trip стоит ~150мс, отдельный create() на человека умножал
  // бы задержку на размер тай-группы без всякой пользы.
  await tx.drawParticipant.createMany({ data: [...tieRows, ...helperRows] });

  await writeAudit(tx, {
    actor,
    action: "tie_break.create",
    entityType: "Round",
    entityId: tieBreakRound.id,
    after: {
      tieBreakOfRoundId: parentRound.id,
      role: tie.role,
      remainingSpots: tie.remainingSpots,
      tieGroupRegistrationIds: tie.group.map((p) => p.registrationId),
      helperRegistrationIds: helpers.map((h) => h.registrationId),
    },
    reason: "Ничья на границе прохода — CLAUDE.md §19-20 запрещает выбирать проходящих автоматически.",
  });
}

export async function parentRoundScoredRegistrationIds(tx: PrismaTx, roundId: string): Promise<Set<string>> {
  const heats = await tx.heat.findMany({
    where: { roundId },
    select: { draws: { orderBy: { version: "desc" }, take: 1, select: { participants: { where: { scored: true }, select: { registrationId: true } } } } },
  });
  return new Set(heats.flatMap((h) => h.draws[0]?.participants.map((p) => p.registrationId) ?? []));
}

// Если раунд только что перешёл в SCORING и оценивать вообще нечего/некому
// (0 требуемых оценок — напр. участников не больше, чем мест, либо на
// дивизионе вообще нет назначенных судей), досчитывает результат сразу же,
// не дожидаясь оценок, которых и не будет. Иначе — ничего не делает, раунд
// ждёт submitJudgeScore().
export async function maybeCalculateOnEntryInTx(tx: PrismaTx, roundId: string, actor: Actor): Promise<void> {
  const round = await tx.round.findUniqueOrThrow({ where: { id: roundId } });
  if (round.type === "TIE_BREAK") return;
  const progress = await getRoundScoringProgressInTx(tx, roundId);
  if (progress.required === 0) {
    await calculateRoundResultsInTx(tx, roundId, actor);
  }
}

export type RoundScoringProgress = { required: number; submitted: number; complete: boolean };

// Считает, сколько РЕАЛЬНО стоит на паркете последним (по order, среди
// обычных раундов — TIE_BREAK не в счёт) раундом этого дивизиона — то есть
// это финал. "Проходят N" в финале — не отсев, а призовые места, поэтому
// финал НИКОГДА не пропускает судейство, даже если участников роли меньше N
// (по прямому решению пользователя, 2026-09-04, дополняет A13).
export async function isFinalStageInTx(tx: PrismaTx | typeof prisma, divisionId: string, order: number): Promise<boolean> {
  const laterCount = await tx.round.count({ where: { divisionId, type: null, order: { gt: order } } });
  return laterCount === 0;
}

// Роли, которых в ЭТОМ раунде не нужно оценивать судьям, потому что
// реальных (не-помощников) участников этой роли не больше, чем мест —
// все и так проходят дальше независимо от баллов (по запросу пользователя,
// 2026-09-04). Финал и служебные TIE_BREAK-раунды исключены намеренно:
// в финале "проходят N" — места, а не отсев (см. isFinalStageInTx); в
// TIE_BREAK кандидатов по построению всегда больше свободных мест (иначе
// перетанцовки не было бы), так что это условие для него и так никогда не
// сработало бы — но явная проверка яснее, чем полагаться на совпадение.
// Чистая функция (без обращения к БД) — переиспользуется и здесь, и в
// getJudgeQueue (scoring.ts), и на странице организатора, каждый раз со
// своими уже загруженными данными, без дублирования самого правила.
export function rolesNotNeedingJudging(
  roleCounts: Record<RegistrationRole, number>,
  finalistsCount: number,
  isFinalStage: boolean,
  roundType: string | null
): Set<RegistrationRole> {
  const skipped = new Set<RegistrationRole>();
  if (roundType === "TIE_BREAK" || isFinalStage) return skipped;
  for (const role of ["LEADER", "FOLLOWER"] as const) {
    if (roleCounts[role] > 0 && roleCounts[role] <= finalistsCount) skipped.add(role);
  }
  return skipped;
}

async function getRoundScoringProgressInTx(tx: PrismaTx | typeof prisma, roundId: string): Promise<RoundScoringProgress> {
  const round = await tx.round.findUniqueOrThrow({
    where: { id: roundId },
    select: { divisionId: true, finalistsCount: true, order: true, type: true, judgingMaxScore: true },
  });
  const heats = await tx.heat.findMany({
    where: { roundId },
    select: {
      draws: {
        orderBy: { version: "desc" },
        take: 1,
        select: {
          participants: {
            where: { scored: true },
            select: { id: true, role: true, judgeScores: { select: { judgeAssignmentId: true, value: true } } },
          },
        },
      },
    },
  });
  const allParticipants = heats.flatMap((h) => h.draws[0]?.participants ?? []);
  if (allParticipants.length === 0) return { required: 0, submitted: 0, complete: true };

  const roleCounts: Record<RegistrationRole, number> = { LEADER: 0, FOLLOWER: 0 };
  for (const p of allParticipants) roleCounts[p.role]++;
  const isFinal = await isFinalStageInTx(tx, round.divisionId, round.order);
  const skippedRoles = rolesNotNeedingJudging(roleCounts, round.finalistsCount ?? 0, isFinal, round.type);
  const participants = allParticipants.filter((p) => !skippedRoles.has(p.role));
  if (participants.length === 0) return { required: 0, submitted: 0, complete: true };

  const assignments = await tx.judgeAssignment.findMany({ where: { divisionId: round.divisionId }, select: { id: true, role: true } });
  const relevantAssignments = assignments.filter((a) => !skippedRoles.has(a.role));

  // Формат 0/1 ("Да/Нет"): раунд не ждёт от судьи явного "Нет" по каждому
  // оставшемуся (клики "Да" сами по себе не завершают раунд — только явное
  // "Готово", confirmJudgeRoundDone в scoring.ts) — по запросу пользователя,
  // 2026-09-04: судья свободно меняет мнение сколько угодно, а раунд не
  // должен мгновенно и необратимо завершиться от случайного лишнего клика.
  // "required"/"submitted" здесь — не сырые оценки, а число судей и число
  // тех из них, кто уже нажал "Готово" (JudgeRoundConfirmation).
  if (round.judgingMaxScore === 1 && (round.finalistsCount ?? 0) > 0) {
    if (relevantAssignments.length === 0) return { required: 0, submitted: 0, complete: true };
    const confirmed = await tx.judgeRoundConfirmation.count({
      where: { roundId, judgeAssignmentId: { in: relevantAssignments.map((a) => a.id) } },
    });
    return { required: relevantAssignments.length, submitted: confirmed, complete: confirmed >= relevantAssignments.length };
  }

  let required = 0;
  let submitted = 0;
  for (const assignment of relevantAssignments) {
    const roleParticipants = participants.filter((p) => p.role === assignment.role);
    const myScores = roleParticipants.flatMap((p) => p.judgeScores.filter((s) => s.judgeAssignmentId === assignment.id));
    required += roleParticipants.length;
    submitted += myScores.length;
  }

  return { required, submitted, complete: submitted >= required };
}

export async function getRoundScoringProgress(roundId: string): Promise<RoundScoringProgress> {
  return getRoundScoringProgressInTx(prisma, roundId);
}

// Вызывается после сохранения очередной оценки — если теперь собрано
// достаточно, сразу считает результат в этой же транзакции.
export async function maybeFinalizeAfterScoreInTx(tx: PrismaTx, roundId: string, actor: Actor): Promise<void> {
  const progress = await getRoundScoringProgressInTx(tx, roundId);
  if (progress.complete) {
    await calculateRoundResultsInTx(tx, roundId, actor);
  }
}

// Перетанцовка — судьи (в жизни) обсуждают вслух, HEAD_JUDGE/EVENT_ADMIN
// вносит итог: ровно remainingSpots человек из tie-группы отмечаются
// ADVANCED, остальные ELIMINATED (SELECT_N, CLAUDE.md §22). Обновляет и
// строку RoundResult родительского раунда (снимает TIE_BREAK_REQUIRED), и
// пишет собственные RoundResult перетанцовки — TieBreakRound должен иметь
// полноценные данные (CLAUDE.md §21).
export async function recordTieBreakDecision(tieBreakRoundId: string, advancingRegistrationIds: string[]): Promise<void> {
  const tieBreakRound = await prisma.round.findUniqueOrThrow({
    where: { id: tieBreakRoundId },
    include: { division: { select: { competitionId: true } }, tieBreakOfRound: true },
  });
  if (tieBreakRound.type !== "TIE_BREAK" || !tieBreakRound.tieBreakOfRound) {
    throw new ValidationFailedError("Это не раунд-перетанцовка.");
  }
  const competitionId = tieBreakRound.division.competitionId;
  const actor = await requirePermission("tie_break:decide", competitionId);

  if (tieBreakRound.status !== "SCORING") {
    throw new ValidationFailedError('Решение перетанцовки можно внести только после того, как заход оттанцевал (статус "Подсчёт баллов").');
  }

  const heat = await prisma.heat.findFirstOrThrow({ where: { roundId: tieBreakRoundId } });
  const draw = await prisma.draw.findFirstOrThrow({ where: { heatId: heat.id }, orderBy: { version: "desc" }, include: { participants: true } });
  const real = draw.participants.filter((p) => p.scored);
  const realIds = new Set(real.map((p) => p.registrationId));

  const advancingSet = new Set(advancingRegistrationIds);
  for (const id of advancingSet) {
    if (!realIds.has(id)) throw new ValidationFailedError("В списке прошедших есть человек, которого не было в перетанцовке.");
  }
  const expected = tieBreakRound.finalistsCount ?? 0;
  if (advancingSet.size !== expected) {
    throw new ValidationFailedError(`Нужно выбрать ровно ${expected} человек — выбрано ${advancingSet.size}.`);
  }

  await prisma.$transaction(async (tx) => {
    let rank = 1;
    for (const p of real) {
      const status = advancingSet.has(p.registrationId) ? "ADVANCED" : "ELIMINATED";
      await tx.roundResult.upsert({
        where: { roundId_registrationId: { roundId: tieBreakRoundId, registrationId: p.registrationId } },
        create: { roundId: tieBreakRoundId, registrationId: p.registrationId, scoreSum: status === "ADVANCED" ? 1 : 0, rank: rank++, status },
        update: { status },
      });
      await tx.roundResult.update({
        where: { roundId_registrationId: { roundId: tieBreakRound.tieBreakOfRoundId!, registrationId: p.registrationId } },
        data: { status },
      });
    }

    await tx.round.update({ where: { id: tieBreakRoundId }, data: { status: "COMPLETED", statusVersion: { increment: 1 }, endedAt: new Date() } });
    await writeAudit(tx, {
      actor,
      action: "tie_break.decide",
      entityType: "Round",
      entityId: tieBreakRoundId,
      after: { advancedRegistrationIds: [...advancingSet] },
    });

    // Если у родительского раунда не осталось других нерешённых
    // перетанцовок (напр. вторая — по противоположной роли), он тоже
    // завершён.
    const stillPending = await tx.round.count({ where: { tieBreakOfRoundId: tieBreakRound.tieBreakOfRoundId!, status: { not: "COMPLETED" } } });
    if (stillPending === 0) {
      const parent = await tx.round.findUniqueOrThrow({ where: { id: tieBreakRound.tieBreakOfRoundId! } });
      await completeRoundInTx(tx, parent, actor);
    }
  });
}
