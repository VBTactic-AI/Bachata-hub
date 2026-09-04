import type { Prisma, RegistrationRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "../rbac/authorize";
import { writeAudit } from "../audit/audit";
import { ValidationFailedError } from "../errors";
import type { Actor } from "../rbac/actor";
import { getRoundEligiblePool } from "../competition/draw-engine";
import { transitionHeat } from "../state/heat-state";

type PrismaTx = Prisma.TransactionClient;

// JUDGES_DANCE (промт пользователя, п.22-24) — две стадии, роль за ролью:
// стадия 1 — ведущие финалисты танцуют (судьи-Ведомые физически партнёрят
// и оценивают "танцующего" судью критерии, судьи-Ведущие смотрят со стороны
// и оценивают остальные); стадия 2 — зеркально, ведомые финалистки танцуют
// с судьями-Ведущими. НЕ использует обычный Draw Engine (там пары —
// участник+участник, здесь партнёр — судья, не хранится и не назначается,
// A5): заходы каждой стадии создаются этим сервисом напрямую, по одному, а
// не через READY->DRAWING->DRAW_LOCKED (docs/00_DECISIONS.md, см. также
// start-final.ts — переход READY->RUNNING минует обычную жеребьёвку).
const STAGE_ROLE: Record<1 | 2, RegistrationRole> = { 1: "LEADER", 2: "FOLLOWER" };
const ROLE_LABEL: Record<RegistrationRole, string> = { LEADER: "Ведущие", FOLLOWER: "Ведомые" };

// Переиспользуется и final-random-couples.ts — та же эксклюзивность
// паркета нужна там для первой пары.
export async function assertNoOtherHeatActive(tx: PrismaTx, competitionId: string): Promise<void> {
  // Та же эксклюзивность паркета, что и transitionHeat() для обычных
  // заходов (docs/00_DECISIONS.md, A4) — здесь заход создаётся сразу
  // RUNNING в обход обычного PENDING->RUNNING перехода, поэтому проверка
  // продублирована вручную.
  const activeElsewhere = await tx.heat.findFirst({
    where: { status: { in: ["RUNNING", "PAUSED"] }, round: { division: { competitionId } } },
  });
  if (activeElsewhere) {
    throw new ValidationFailedError("Нельзя начать эту стадию: сейчас уже идёт (или на паузе) другой заход этого соревнования — сначала завершите его.");
  }
}

async function createStageHeatInTx(
  tx: PrismaTx,
  params: { roundId: string; finalSessionId: string; stage: 1 | 2; divisionId: string; roundOrder: number; actor: Actor }
): Promise<void> {
  const role = STAGE_ROLE[params.stage];
  const eligibleIds = await getRoundEligiblePool(tx, { divisionId: params.divisionId, roundOrder: params.roundOrder, role });

  const registrations = await tx.registration.findMany({
    where: { id: { in: [...eligibleIds] } },
    include: { checkIn: { select: { bibNumber: true } } },
  });
  registrations.sort((a, b) => Number(a.checkIn?.bibNumber ?? 0) - Number(b.checkIn?.bibNumber ?? 0));

  const heat = await tx.heat.create({
    data: { roundId: params.roundId, number: params.stage, status: "RUNNING", startedAt: new Date() },
  });
  const draw = await tx.draw.create({
    data: {
      heatId: heat.id,
      version: 1,
      seed: null,
      algorithmVersion: "v1",
      createdById: params.actor.userId,
      reason: `Стадия ${params.stage} финала «Танец с судьями» (${ROLE_LABEL[role]}).`,
    },
  });
  if (registrations.length > 0) {
    await tx.drawParticipant.createMany({
      data: registrations.map((r, i) => ({ drawId: draw.id, registrationId: r.id, role, scored: true, calledOrder: i + 1 })),
    });
  }
  await tx.finalSession.update({ where: { id: params.finalSessionId }, data: { currentStage: params.stage } });
  await writeAudit(tx, {
    actor: params.actor,
    action: "judges_dance_stage.start",
    entityType: "Round",
    entityId: params.roundId,
    after: { stage: params.stage, role, heatId: heat.id, participantCount: registrations.length },
    reason: `Начата стадия ${params.stage} финала «Танец с судьями» (${ROLE_LABEL[role]}).`,
  });
}

export type AdvanceJudgesDanceResult = { stage: number | null };

// Одно действие "Далее" на всю прогрессию стадий JUDGES_DANCE:
// currentStage=null -> создаёт заход стадии 1 (Ведущие), currentStage=1 ->
// завершает заход стадии 1 и создаёт заход стадии 2 (Ведомые) АТОМАРНО в
// одной транзакции (иначе между двумя отдельными действиями
// autoAdvanceRoundIfAllHeatsFinishedInTx увидел бы "все заходы завершены"
// после одной лишь стадии 1 и преждевременно закрыл бы раунд),
// currentStage=2 -> завершает заход стадии 2 обычным transitionHeat() —
// это уже действительно последний заход раунда, дальше работает
// стандартный каскад (round FINISHED->SCORING->подсчёт результата).
export async function advanceJudgesDanceStage(roundId: string): Promise<AdvanceJudgesDanceResult> {
  const round = await prisma.round.findUniqueOrThrow({
    where: { id: roundId },
    relationLoadStrategy: "join",
    include: { division: { select: { id: true, competitionId: true } }, finalSession: true, heats: { orderBy: { number: "asc" } } },
  });
  const actor = await requirePermission("final:manage", round.division.competitionId);

  if (!round.finalSession || round.finalSession.format !== "JUDGES_DANCE") {
    throw new ValidationFailedError("Это не финал формата «Танец с судьями».");
  }
  if (round.status === "COMPLETED") {
    throw new ValidationFailedError("Финал уже завершён.");
  }

  const currentStage = round.finalSession.currentStage;

  if (currentStage === null) {
    await prisma.$transaction(async (tx) => {
      await assertNoOtherHeatActive(tx, round.division.competitionId);
      await createStageHeatInTx(tx, {
        roundId,
        finalSessionId: round.finalSession!.id,
        stage: 1,
        divisionId: round.division.id,
        roundOrder: round.order,
        actor,
      });
    });
    return { stage: 1 };
  }

  if (currentStage === 1) {
    const heat1 = round.heats[0];
    if (!heat1) throw new ValidationFailedError("Не найден заход первой стадии.");
    await prisma.$transaction(async (tx) => {
      const result = await tx.heat.updateMany({
        where: { id: heat1.id, statusVersion: heat1.statusVersion },
        data: { status: "FINISHED", statusVersion: { increment: 1 }, endedAt: new Date() },
      });
      if (result.count === 0) {
        throw new ValidationFailedError("Заход первой стадии уже изменён кем-то другим — обновите страницу.");
      }
      await writeAudit(tx, {
        actor,
        action: "heat.transition",
        entityType: "Heat",
        entityId: heat1.id,
        before: { status: heat1.status },
        after: { status: "FINISHED" },
        reason: "Стадия 1 (Ведущие) завершена — начинается стадия 2 (Ведомые).",
      });
      await createStageHeatInTx(tx, {
        roundId,
        finalSessionId: round.finalSession!.id,
        stage: 2,
        divisionId: round.division.id,
        roundOrder: round.order,
        actor,
      });
    });
    return { stage: 2 };
  }

  if (currentStage === 2) {
    const heat2 = round.heats[round.heats.length - 1];
    if (!heat2) throw new ValidationFailedError("Не найден заход второй стадии.");
    await transitionHeat(heat2.id, "FINISHED", { reason: "Стадия 2 (Ведомые) завершена — подсчёт результатов финала." });
    return { stage: null };
  }

  throw new ValidationFailedError("Некорректное состояние стадий финала.");
}
