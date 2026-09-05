import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "../rbac/authorize";
import { writeAudit } from "../audit/audit";
import { ValidationFailedError } from "../errors";
import { getRoundEligiblePool, mulberry32 } from "../competition/draw-engine";
import { transitionHeat } from "../state/heat-state";
import { assertNoOtherHeatActive } from "./final-judges-dance";

// RANDOM_COUPLES (промт пользователя, п.25-27) — пары формируются случайно,
// одна за раз: система выбирает следующего ведущего и следующую ведомую из
// ещё не станцевавших, пара танцует одна, судьи оценивают каждого по своей
// роли (как в NORMAL — final-scoring-matrix.ts, dancingJudgeCriteriaIds
// здесь не используется). Жеребьёвка выполняется сервером и сохраняется
// сразу (CLAUDE.md §6) — повторный вызов/обновление страницы не меняет уже
// сформированные пары, "Следующая пара" двигает вперёд только НОВУЮ пару.
// Как и JUDGES_DANCE — не через обычный Draw Engine (A5): заходы (по одному
// на пару) создаются этим сервисом напрямую (start-final.ts переводит
// раунд сразу READY -> RUNNING для этого формата).

// Одно действие "Следующая пара" на всю прогрессию: если текущая пара ещё
// не станцевала (её заход не завершён) — завершает его и, если остались
// нерасписанные участники, сразу формирует и запускает следующую пару в
// ОДНОЙ транзакции (та же защита от преждевременного "раунд закончен", что
// и в advanceJudgesDanceStage — иначе autoAdvanceRoundIfAllHeatsFinishedInTx
// увидел бы "все заходы завершены" после одной лишь текущей пары). Если
// участников для новой пары больше нет — просто завершает последний заход
// обычным transitionHeat (запускает подсчёт результата).
export async function advanceRandomCouples(roundId: string, trackName?: string): Promise<{ pairNumber: number | null }> {
  const round = await prisma.round.findUniqueOrThrow({
    where: { id: roundId },
    relationLoadStrategy: "join",
    include: {
      division: { select: { id: true, competitionId: true } },
      finalSession: { include: { pairs: true } },
      heats: { orderBy: { number: "asc" } },
    },
  });
  const actor = await requirePermission("final:manage", round.division.competitionId);

  if (!round.finalSession || round.finalSession.format !== "RANDOM_COUPLES") {
    throw new ValidationFailedError("Это не финал формата «Случайные пары».");
  }
  if (round.status === "COMPLETED") {
    throw new ValidationFailedError("Финал уже завершён.");
  }

  const pairedLeaderIds = new Set(round.finalSession.pairs.map((p) => p.leaderRegistrationId));
  const pairedFollowerIds = new Set(round.finalSession.pairs.map((p) => p.followerRegistrationId));

  const [leaderPool, followerPool] = await prisma.$transaction(async (tx) => {
    const leaders = await getRoundEligiblePool(tx, { divisionId: round.division.id, roundOrder: round.order, role: "LEADER" });
    const followers = await getRoundEligiblePool(tx, { divisionId: round.division.id, roundOrder: round.order, role: "FOLLOWER" });
    return [
      [...leaders].filter((id) => !pairedLeaderIds.has(id)),
      [...followers].filter((id) => !pairedFollowerIds.has(id)),
    ];
  });

  const currentHeat = round.heats[round.heats.length - 1];
  const hasUnfinishedHeat = !!currentHeat && currentHeat.status !== "FINISHED";
  const poolExhausted = leaderPool.length === 0 || followerPool.length === 0;

  if (poolExhausted) {
    if (!hasUnfinishedHeat) {
      throw new ValidationFailedError("Все пары уже сформированы.");
    }
    // Последняя пара станцевала, новых участников не осталось — просто
    // завершаем её заход обычным путём (запускает подсчёт результата).
    await transitionHeat(currentHeat.id, "FINISHED", { reason: "Последняя пара финала «Случайные пары» станцевала — подсчёт результатов." });
    return { pairNumber: null };
  }

  const pairNumber = round.finalSession.pairs.length + 1;

  await prisma.$transaction(async (tx) => {
    if (hasUnfinishedHeat) {
      const result = await tx.heat.updateMany({
        where: { id: currentHeat.id, statusVersion: currentHeat.statusVersion },
        data: { status: "FINISHED", statusVersion: { increment: 1 }, endedAt: new Date() },
      });
      if (result.count === 0) {
        throw new ValidationFailedError("Текущая пара уже изменена кем-то другим — обновите страницу.");
      }
      await writeAudit(tx, {
        actor,
        action: "heat.transition",
        entityType: "Heat",
        entityId: currentHeat.id,
        before: { status: currentHeat.status },
        after: { status: "FINISHED" },
        reason: "Пара станцевала — переход к следующей.",
      });
    } else {
      await assertNoOtherHeatActive(tx, round.division.competitionId);
    }

    // Случайный выбор — сервер, не клиент (CLAUDE.md §6/A5). FLOW-005: seed
    // генерируется ДО выбора и прогоняется через тот же mulberry32, что и
    // Draw Engine — тот же seed воспроизводит тот же выбор (leader, затем
    // follower), а не только сохраняет решение фактом записи в БД.
    const seed = crypto.randomBytes(8).toString("hex");
    const rng = mulberry32(parseInt(seed.slice(0, 8), 16));
    const leaderId = leaderPool[Math.floor(rng() * leaderPool.length)];
    const followerId = followerPool[Math.floor(rng() * followerPool.length)];

    const heat = await tx.heat.create({ data: { roundId, number: pairNumber, status: "RUNNING", startedAt: new Date() } });
    const draw = await tx.draw.create({
      data: {
        heatId: heat.id,
        version: 1,
        seed,
        algorithmVersion: "v1",
        createdById: actor.userId,
        reason: `Случайная пара №${pairNumber} финала «Случайные пары».`,
      },
    });
    await tx.drawParticipant.createMany({
      data: [
        { drawId: draw.id, registrationId: leaderId, role: "LEADER", scored: true, calledOrder: 1 },
        { drawId: draw.id, registrationId: followerId, role: "FOLLOWER", scored: true, calledOrder: 2 },
      ],
    });
    await tx.finalPair.create({
      data: {
        finalSessionId: round.finalSession!.id,
        heatId: heat.id,
        pairNumber,
        leaderRegistrationId: leaderId,
        followerRegistrationId: followerId,
        trackName: trackName?.trim() || null,
        seed,
        createdById: actor.userId,
      },
    });
    await writeAudit(tx, {
      actor,
      action: "final_pair.create",
      entityType: "Round",
      entityId: roundId,
      after: { pairNumber, leaderRegistrationId: leaderId, followerRegistrationId: followerId, trackName: trackName?.trim() || null },
      reason: "Случайная жеребьёвка пары (сервер, seed сохранён).",
    });
  });

  return { pairNumber };
}
