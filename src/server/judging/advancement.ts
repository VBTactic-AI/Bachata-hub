import type { Prisma, RegistrationRole, Round } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "../rbac/authorize";
import { writeAudit } from "../audit/audit";
import { ConcurrentModificationError, ValidationFailedError } from "../errors";
import type { Actor } from "../rbac/actor";
import { fillHelperShortage } from "../competition/draw-engine";

type PrismaTx = Prisma.TransactionClient;

type ScoredParticipant = { id: string; registrationId: string; role: RegistrationRole; scoreSum: number };

// Хранится в Round.config служебного TIE_BREAK-раунда — recordTieBreakDecision
// по нему отличает обычную (SELECT_N) перетанцовку от FULL_RANK (см.
// PendingTieBreak выше, TIEBREAK-001).
type TieBreakRoundConfig = { tieBreakKind?: "FULL_RANK"; startRank?: number };

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

type PendingTieBreak = {
  role: RegistrationRole;
  group: ScoredParticipant[];
  remainingSpots: number;
  // SELECT_N — обычная ничья на границе отсева (какие-то N из группы
  // проходят, остальные нет). FULL_RANK — ничья ВНУТРИ уже проходящих
  // (никого не отсеиваем, нужно только решить порядок мест внутри группы) —
  // возникает только в финале, где место имеет значение само по себе
  // (TIEBREAK-001, см. findTiedRuns ниже). startRank — с какого места
  // (1-based, в рамках своей роли) начинается эта группа.
  mode: "SELECT_N" | "FULL_RANK";
  startRank?: number;
};

// Ищет "пробеги" из 2+ подряд идущих участников с одинаковой суммой баллов
// в уже отсортированном по убыванию списке — используется, чтобы найти
// ничью ВНУТРИ группы "точно проходящих" (никого не отсеивают, но точный
// порядок мест внутри — реальная неоднозначность, которую splitByCutoff не
// видит, так как её проверка ничьей срабатывает только на границе отсева).
function findTiedRuns(sortedDesc: ScoredParticipant[]): { members: ScoredParticipant[]; startRank: number }[] {
  const runs: { members: ScoredParticipant[]; startRank: number }[] = [];
  let i = 0;
  while (i < sortedDesc.length) {
    let j = i + 1;
    while (j < sortedDesc.length && sortedDesc[j].scoreSum === sortedDesc[i].scoreSum) j++;
    if (j - i >= 2) runs.push({ members: sortedDesc.slice(i, j), startRank: i + 1 });
    i = j;
  }
  return runs;
}

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

  // TIEBREAK-001: в финале место (rank) становится официальным Result.placement
  // (results.ts) — splitByCutoff сам по себе видит только ничью НА ГРАНИЦЕ
  // отсева, но в финале обычно никого не отсеивают (finalistsCount >=
  // числа участников), и тогда splitByCutoff молча возвращает всех в
  // advanced без всякой проверки на равенство сумм — реальная ничья за
  // место досталась бы по порядку элементов массива/БД (CLAUDE.md §19-20/§60
  // это прямо запрещают). Для финала дополнительно ищем такие ничьи внутри
  // уже "точно проходящих" и переводим их в TIE_BREAK_REQUIRED вместо того,
  // чтобы молча присвоить разные места.
  const isFinal = await isFinalStageInTx(tx, round.division.id, round.order);
  const fullRankPending: PendingTieBreak[] = [];
  const fullRankMemberIds = new Set<string>();
  if (isFinal) {
    for (const [role, side] of [
      ["LEADER", leaders],
      ["FOLLOWER", followers],
    ] as const) {
      for (const run of findTiedRuns(side.advanced)) {
        fullRankPending.push({ role, group: run.members, remainingSpots: run.members.length, mode: "FULL_RANK", startRank: run.startRank });
        for (const m of run.members) fullRankMemberIds.add(m.id);
      }
    }
  }

  const resultRows: { registrationId: string; scoreSum: number; rank: number; status: "ADVANCED" | "ELIMINATED" | "TIE_BREAK_REQUIRED" }[] = [];
  for (const side of [leaders, followers]) {
    const sortedAll = [...side.advanced, ...side.tieGroup, ...side.eliminated].sort((a, b) => b.scoreSum - a.scoreSum);
    sortedAll.forEach((p, idx) => {
      const status = fullRankMemberIds.has(p.id)
        ? "TIE_BREAK_REQUIRED"
        : side.advanced.includes(p)
          ? "ADVANCED"
          : side.tieGroup.includes(p)
            ? "TIE_BREAK_REQUIRED"
            : "ELIMINATED";
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

  const pending: PendingTieBreak[] = [...fullRankPending];
  if (leaders.tieGroup.length > 0)
    pending.push({ role: "LEADER", group: leaders.tieGroup, remainingSpots: finalistsCount - leaders.advanced.length, mode: "SELECT_N" });
  if (followers.tieGroup.length > 0)
    pending.push({ role: "FOLLOWER", group: followers.tieGroup, remainingSpots: finalistsCount - followers.advanced.length, mode: "SELECT_N" });

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

  const config: TieBreakRoundConfig =
    tie.mode === "FULL_RANK" ? { tieBreakKind: "FULL_RANK", startRank: tie.startRank ?? 1 } : {};
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
      reason:
        tie.mode === "FULL_RANK"
          ? `Автоматически сформировано: ничья за места ${tie.startRank}-${(tie.startRank ?? 1) + tie.group.length - 1} в финале (роль ${tie.role === "LEADER" ? "Ведущий" : "Ведомый"}) — никого не отсеиваем, нужно решить порядок мест.`
          : `Автоматически сформировано: ничья на границе прохода (роль ${tie.role === "LEADER" ? "Ведущий" : "Ведомый"}).`,
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
// вносит итог. Два режима (см. TieBreakRoundConfig/PendingTieBreak выше):
// SELECT_N (обычная ничья на границе отсева, CLAUDE.md §22) — ровно
// remainingSpots человек из tie-группы отмечаются ADVANCED, остальные
// ELIMINATED, registrationIds — НЕупорядоченный набор проходящих; FULL_RANK
// (TIEBREAK-001, только в финале, никого не отсеивают) — registrationIds
// обязаны содержать ВСЕХ участников группы, порядок значим (0-й — лучшее
// место внутри группы), каждому присваивается итоговое место
// startRank+индекс. Обновляет и строку RoundResult родительского раунда
// (снимает TIE_BREAK_REQUIRED, а для FULL_RANK — ещё и её rank, который
// иначе остался бы тем произвольным значением, что присвоил
// calculateRoundResultsInTx при обнаружении ничьи), и пишет собственные
// RoundResult перетанцовки — TieBreakRound должен иметь полноценные данные
// (CLAUDE.md §21).
export async function recordTieBreakDecision(tieBreakRoundId: string, registrationIds: string[]): Promise<void> {
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

  const config = (tieBreakRound.config as unknown as TieBreakRoundConfig) ?? {};
  const isFullRank = config.tieBreakKind === "FULL_RANK";

  const heat = await prisma.heat.findFirstOrThrow({ where: { roundId: tieBreakRoundId } });
  const draw = await prisma.draw.findFirstOrThrow({ where: { heatId: heat.id }, orderBy: { version: "desc" }, include: { participants: true } });
  const real = draw.participants.filter((p) => p.scored);
  const realIds = new Set(real.map((p) => p.registrationId));

  const providedSet = new Set(registrationIds);
  for (const id of providedSet) {
    if (!realIds.has(id)) throw new ValidationFailedError("В списке есть человек, которого не было в этой перетанцовке.");
  }
  if (isFullRank) {
    if (registrationIds.length !== real.length || providedSet.size !== real.length) {
      throw new ValidationFailedError(`Нужно расставить по порядку всех ${real.length} участников этой перетанцовки — без пропусков и повторов.`);
    }
  } else {
    const expected = tieBreakRound.finalistsCount ?? 0;
    if (providedSet.size !== expected) {
      throw new ValidationFailedError(`Нужно выбрать ровно ${expected} человек — выбрано ${providedSet.size}.`);
    }
  }

  await prisma.$transaction(async (tx) => {
    if (isFullRank) {
      const startRank = config.startRank ?? 1;
      for (let i = 0; i < registrationIds.length; i++) {
        const registrationId = registrationIds[i];
        await tx.roundResult.upsert({
          where: { roundId_registrationId: { roundId: tieBreakRoundId, registrationId } },
          create: { roundId: tieBreakRoundId, registrationId, scoreSum: 0, rank: i + 1, status: "ADVANCED" },
          update: { status: "ADVANCED", rank: i + 1 },
        });
        await tx.roundResult.update({
          where: { roundId_registrationId: { roundId: tieBreakRound.tieBreakOfRoundId!, registrationId } },
          data: { status: "ADVANCED", rank: startRank + i },
        });
      }
    } else {
      let rank = 1;
      for (const p of real) {
        const status = providedSet.has(p.registrationId) ? "ADVANCED" : "ELIMINATED";
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
    }

    // DB-001: в отличие от обычных переходов состояния, здесь раньше не было
    // проверки statusVersion — второе (гоночное или повторное) решение по
    // той же перетанцовке молча перезаписало бы уже принятое, без единого
    // обнаруженного конфликта. updateMany + statusVersion делает это тем же
    // способом, что и весь остальной движок (machine.ts, completeRoundInTx).
    const completedTieBreak = await tx.round.updateMany({
      where: { id: tieBreakRoundId, status: "SCORING", statusVersion: tieBreakRound.statusVersion },
      data: { status: "COMPLETED", statusVersion: { increment: 1 }, endedAt: new Date() },
    });
    if (completedTieBreak.count === 0) {
      throw new ConcurrentModificationError("Round");
    }
    await writeAudit(tx, {
      actor,
      action: "tie_break.decide",
      entityType: "Round",
      entityId: tieBreakRoundId,
      after: isFullRank ? { orderedRegistrationIds: registrationIds } : { advancedRegistrationIds: [...providedSet] },
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
