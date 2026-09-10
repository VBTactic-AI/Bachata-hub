import type { Prisma, RegistrationRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "../rbac/authorize";
import { writeAudit } from "../audit/audit";
import { ValidationFailedError } from "../errors";
import { transitionRound } from "../state/round-state";
import { allRoundParticipantIds, getRoundEligiblePool, isFinalStageInTx } from "./draw-engine";

// "Режим редактирования" (промт пользователя, 2026-09-10) — организатор
// может заполнить раунд вручную вместо (или в дополнение к) обычной кнопки
// "Начать жеребьёвку" (start-round-drawing.ts), а также донабрать/убрать
// реальных участников из уже сформированной автоматической жеребьёвки, пока
// раунд не зафиксирован. CLAUDE.md §50 — версионируется отдельной меткой, не
// путается с DRAW_ALGORITHM_VERSION автоматического алгоритма (draw-engine.ts):
// список составил человек, это не версия алгоритма распределения.
export const MANUAL_DRAW_ALGORITHM_VERSION = "manual-v1";

// Перевести раунд READY -> DRAWING БЕЗ автоматического формирования заходов
// (в отличие от startRoundDrawing, formDrawInTx здесь не вызывается ни разу)
// — организатор добавляет реальных участников по одному сам, addRealParticipant
// ниже. Если раунд уже в DRAWING (жеребьёвка уже была проведена автоматически
// или заполнена вручную ранее) — вызывать эту функцию не нужно, "режим
// редактирования" на клиенте в этом случае просто включает уже готовые кнопки,
// без изменения состояния раунда.
export async function startRoundManually(roundId: string): Promise<void> {
  const round = await prisma.round.findUniqueOrThrow({
    where: { id: roundId },
    include: { finalSession: { select: { id: true } } },
  });

  // Тот же гейт, что и у автоматической жеребьёвки (start-round-drawing.ts,
  // найдено на живом тестировании 2026-09-05) — финал обязан сначала пройти
  // через "Начать финал", какой бы способ заполнения заходов ни выбрали дальше.
  if (round.type === null && !round.finalSession) {
    const isFinal = await isFinalStageInTx(prisma, round.divisionId, round.order);
    if (isFinal) {
      throw new ValidationFailedError(
        'Это финальный раунд категории — сначала нажмите "Начать финал" (фиксирует критерии оценки).'
      );
    }
  }

  const heatsCount = await prisma.heat.count({ where: { roundId } });
  if (heatsCount === 0) {
    throw new ValidationFailedError("В раунде нет ни одного захода — сначала создайте хотя бы один.");
  }

  const existingConfig = (round.config ?? {}) as Record<string, unknown>;
  await transitionRound(roundId, "DRAWING", {
    // transitionRound отклоняет переход в DRAWING без extraData (CLAUDE.md §45
    // — не голый PATCH статуса для операции с бизнес-смыслом); manualDraw —
    // чисто информационная пометка в Round.config, ничем не используется, но
    // явно отличает эту запись от config автоматической жеребьёвки (там же
    // drawCallOrder).
    extraData: { config: { ...existingConfig, manualDraw: true } as Prisma.InputJsonValue },
  });
}

export type RealCandidate = { id: string; displayName: string; bibNumber: string | null };

// Кандидаты для ручного добавления В ЭТОТ заход — строго своя категория
// (в отличие от помощников, которые могут быть и из чужой), той же роли,
// которых ещё нет ни в одном заходе этого раунда (allRoundParticipantIds —
// реальных и помощников вместе, один человек не может быть на паркете
// дважды одновременно), с учётом того же пула, что и автоматическая
// жеребьёвка (getRoundEligiblePool — CHECKED_IN/LATE + прошедшие предыдущий
// раунд дивизиона, A9/A13). remainingSlots — сколько ещё реально влезает по
// вместимости захода (héatCapacity), с учётом уже вызванных, включая
// помощников — UI не должен предлагать выбрать больше.
export async function listRealCandidates(
  heatId: string,
  role: RegistrationRole
): Promise<{ registrations: RealCandidate[]; remainingSlots: number }> {
  const heat = await prisma.heat.findFirstOrThrow({
    where: { id: heatId },
    relationLoadStrategy: "join",
    include: {
      round: { include: { division: { select: { id: true, competitionId: true, heatCapacity: true } } } },
      draws: { orderBy: { version: "desc" }, take: 1, select: { participants: { select: { role: true } } } },
    },
  });
  const competitionId = heat.round.division.competitionId;
  await requirePermission("draw:override", competitionId);

  const heatCapacity = heat.round.heatCapacity ?? heat.round.division.heatCapacity;
  const currentInRole = (heat.draws[0]?.participants ?? []).filter((p) => p.role === role).length;
  const remainingSlots = Math.max(0, heatCapacity - currentInRole);

  const [eligibleIds, alreadyInRound] = await Promise.all([
    getRoundEligiblePool(prisma, { divisionId: heat.round.divisionId, roundOrder: heat.round.order, role }),
    allRoundParticipantIds(prisma, heat.roundId),
  ]);
  const candidateIds = [...eligibleIds].filter((id) => !alreadyInRound.has(id));
  if (candidateIds.length === 0) return { registrations: [], remainingSlots };

  const regs = await prisma.registration.findMany({
    where: { id: { in: candidateIds } },
    include: { dancer: true, checkIn: { select: { bibNumber: true } } },
  });
  regs.sort((a, b) => Number(a.checkIn?.bibNumber ?? 0) - Number(b.checkIn?.bibNumber ?? 0));

  return {
    registrations: regs.map((r) => ({ id: r.id, displayName: r.dancer.displayName, bibNumber: r.checkIn?.bibNumber ?? null })),
    remainingSlots,
  };
}

// Добавить ОДНОГО реального (не помощника) участника в заход вручную —
// новая возможность (2026-09-10): раньше добавить в заход можно было только
// помощника (draw-helper.ts, addDrawHelper), никогда живого "нового" своего
// участника мимо обычной жеребьёвки. Здесь это разрешено НАМЕРЕННО (в отличие
// от addDrawHelper/resolveHelperSource, которые до сих пор это запрещают) —
// это и есть смысл режима редактирования; scored=true, helperSource=null —
// участник учитывается в результате раунда как обычно.
export async function addRealParticipant(heatId: string, registrationId: string, role: RegistrationRole): Promise<{ id: string }> {
  const heat = await prisma.heat.findFirstOrThrow({
    where: { id: heatId },
    relationLoadStrategy: "join",
    include: {
      round: { include: { division: { select: { id: true, competitionId: true, heatCapacity: true } } } },
      draws: { orderBy: { version: "desc" }, take: 1, include: { participants: true } },
    },
  });
  const competitionId = heat.round.division.competitionId;
  const actor = await requirePermission("draw:override", competitionId);

  if (heat.round.status !== "DRAWING") {
    throw new ValidationFailedError('Добавлять участников можно только пока раунд в статусе "Жеребьёвка".');
  }
  if (heat.status !== "PENDING") {
    throw new ValidationFailedError("Заход уже запущен — список нельзя менять.");
  }

  const registration = await prisma.registration.findUniqueOrThrow({
    where: { id: registrationId },
    include: { checkIn: true },
  });
  if (registration.divisionId !== heat.round.divisionId) {
    throw new ValidationFailedError("Добавить в заход можно только участника этой же категории.");
  }
  if (registration.role !== role) {
    throw new ValidationFailedError("Роль участника должна совпадать с его собственной ролью регистрации.");
  }
  if (registration.status !== "REGISTERED") {
    throw new ValidationFailedError('Участник должен быть в статусе "Зарегистрирован".');
  }
  if (!registration.checkIn || !["CHECKED_IN", "LATE"].includes(registration.checkIn.status)) {
    throw new ValidationFailedError("Участник должен пройти check-in.");
  }

  const eligibleIds = await getRoundEligiblePool(prisma, {
    divisionId: heat.round.divisionId,
    roundOrder: heat.round.order,
    role,
  });
  if (!eligibleIds.has(registrationId)) {
    throw new ValidationFailedError(
      "Этот участник не входит в пул этого раунда — не прошёл предыдущий раунд дивизиона (A9)."
    );
  }

  const alreadyInRound = await allRoundParticipantIds(prisma, heat.roundId);
  if (alreadyInRound.has(registrationId)) {
    throw new ValidationFailedError("Этот участник уже в каком-то заходе этого раунда.");
  }

  const heatCapacity = heat.round.heatCapacity ?? heat.round.division.heatCapacity;
  const currentInRole = (heat.draws[0]?.participants ?? []).filter((p) => p.role === role).length;
  if (currentInRole >= heatCapacity) {
    throw new ValidationFailedError(`Заход уже заполнен по этой роли (вместимость ${heatCapacity}) — добавить больше нельзя.`);
  }

  const created = await prisma.$transaction(async (tx) => {
    let drawId = heat.draws[0]?.id;
    if (!drawId) {
      // Первое ручное добавление в ещё не сформированный заход — создаём
      // Draw версии 1 напрямую (тот же приём, что и splitHeatOverflow для
      // нового захода, draw-engine.ts), без formDrawInTx: здесь список
      // составляет человек, а не алгоритм.
      const draw = await tx.draw.create({
        data: {
          heatId,
          version: 1,
          seed: null,
          algorithmVersion: MANUAL_DRAW_ALGORITHM_VERSION,
          createdById: actor.userId,
        },
      });
      drawId = draw.id;
      await writeAudit(tx, {
        actor,
        action: "draw.create",
        entityType: "Draw",
        entityId: draw.id,
        after: { heatId, version: 1, algorithmVersion: MANUAL_DRAW_ALGORITHM_VERSION, manual: true },
      });
    }

    const maxOrder = await tx.drawParticipant.aggregate({ where: { drawId }, _max: { calledOrder: true } });
    const calledOrder = (maxOrder._max.calledOrder ?? 0) + 1;

    const participant = await tx.drawParticipant.create({
      data: { drawId, registrationId, role, scored: true, calledOrder },
    });
    await writeAudit(tx, {
      actor,
      action: "draw_participant.add_manual",
      entityType: "DrawParticipant",
      entityId: participant.id,
      after: { heatId, drawId, registrationId, role },
    });
    return participant;
  });

  return { id: created.id };
}

// Убрать РЕАЛЬНОГО (не помощника) участника из захода вручную — раньше
// единственный способ был "Пересобрать" (полная замена всего списка захода).
// Помощников по-прежнему убирает removeDrawHelper (draw-helper.ts) — эта
// функция явно отказывает, если участник помощник, чтобы не дублировать
// audit-семантику двух разных действий одной кнопкой.
export async function removeRealParticipant(drawParticipantId: string): Promise<void> {
  const participant = await prisma.drawParticipant.findFirstOrThrow({
    where: { id: drawParticipantId },
    relationLoadStrategy: "join",
    include: {
      draw: { include: { heat: { include: { round: { include: { division: { select: { competitionId: true } } } } } } } },
    },
  });
  const competitionId = participant.draw.heat.round.division.competitionId;
  const actor = await requirePermission("draw:override", competitionId);

  if (participant.helperSource) {
    throw new ValidationFailedError("Это помощник — уберите его кнопкой «убрать» рядом с помощником, не этим действием.");
  }
  if (participant.draw.heat.round.status !== "DRAWING") {
    throw new ValidationFailedError('Убрать участника можно только пока раунд в статусе "Жеребьёвка".');
  }
  if (participant.draw.heat.status !== "PENDING") {
    throw new ValidationFailedError("Заход уже запущен — список нельзя менять.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.drawParticipant.delete({ where: { id: drawParticipantId } });
    await writeAudit(tx, {
      actor,
      action: "draw_participant.remove_manual",
      entityType: "DrawParticipant",
      entityId: drawParticipantId,
      before: { registrationId: participant.registrationId, role: participant.role },
    });
  });
}
