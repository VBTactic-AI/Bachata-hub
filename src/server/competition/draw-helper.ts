import type { RegistrationRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "../rbac/authorize";
import { writeAudit } from "../audit/audit";
import { ValidationFailedError } from "../errors";

// Кандидаты в помощники для конкретного заезда/роли — список по дивизионам
// этого же соревнования плюс подсказка "кого предложить по умолчанию", тот
// же порядок приоритета, что и в авто-доборе при жеребьёвке (A10, уточнено
// 2026-09-04): ближайшая категория СТРОГО выше (если несколько подряд без
// людей — следующая выше и т.д.); если категорий выше совсем нет — свои,
// кто уже станцевал в другом заезде раунда; и только если и там пусто —
// ближайшая категория ниже. Это только подсказка для UI — организатор может
// выбрать любого показанного кандидата, ничего не блокируется по уровню
// категории (docs/00_DECISIONS.md).
export async function listHelperCandidates(
  heatId: string,
  role: RegistrationRole
): Promise<{
  suggestedRegistrationId: string | null;
  divisions: {
    divisionId: string;
    categoryName: string;
    categoryOrder: number;
    isOwnDivision: boolean;
    registrations: { id: string; displayName: string; bibNumber: string | null }[];
  }[];
}> {
  const heat = await prisma.heat.findUniqueOrThrow({
    where: { id: heatId },
    include: { round: { include: { division: { include: { category: true } } } } },
  });
  const competitionId = heat.round.division.competitionId;
  await requirePermission("draw:override", competitionId);

  const ownDivisionId = heat.round.divisionId;
  const ownOrder = heat.round.division.category.order;

  const [divisions, alreadyScored] = await Promise.all([
    prisma.division.findMany({ where: { competitionId }, include: { category: true } }),
    prisma.drawParticipant.findMany({
      where: { scored: true, draw: { heat: { roundId: heat.roundId, id: { not: heatId } } } },
      select: { registrationId: true },
    }),
  ]);
  const alreadyScoredIds = new Set(alreadyScored.map((p) => p.registrationId));

  const result: {
    divisionId: string;
    categoryName: string;
    categoryOrder: number;
    isOwnDivision: boolean;
    registrations: { id: string; displayName: string; bibNumber: string | null }[];
  }[] = [];

  for (const division of divisions) {
    const regs = await prisma.registration.findMany({
      where: {
        divisionId: division.id,
        role,
        status: "REGISTERED",
        checkIn: { is: { status: { in: ["CHECKED_IN", "LATE"] } } },
      },
      include: { dancer: true, checkIn: { select: { bibNumber: true } } },
    });
    // В своём дивизионе помощником может быть только тот, кто уже
    // станцевал (получил scored=true) в другом заезде этого раунда — иначе
    // это была бы попытка тайком добавить лишнего "настоящего" участника
    // мимо обычной жеребьёвки.
    const eligible = division.id === ownDivisionId ? regs.filter((r) => alreadyScoredIds.has(r.id)) : regs;
    if (eligible.length === 0) continue;
    result.push({
      divisionId: division.id,
      categoryName: division.category.name,
      categoryOrder: division.category.order,
      isOwnDivision: division.id === ownDivisionId,
      registrations: eligible.map((r) => ({ id: r.id, displayName: r.dancer.displayName, bibNumber: r.checkIn?.bibNumber ?? null })),
    });
  }

  const higher = result
    .filter((d) => !d.isOwnDivision && d.categoryOrder > ownOrder)
    .sort((a, b) => a.categoryOrder - b.categoryOrder);
  const own = result.find((d) => d.isOwnDivision);
  const lower = result
    .filter((d) => !d.isOwnDivision && d.categoryOrder < ownOrder)
    .sort((a, b) => b.categoryOrder - a.categoryOrder);
  const suggestedDivision = higher[0] ?? own ?? lower[0] ?? null;

  return { suggestedRegistrationId: suggestedDivision?.registrations[0]?.id ?? null, divisions: result };
}

type HelperSource = "GUEST_HIGHER_CATEGORY" | "REUSED_ALREADY_SCORED";

// Общая проверка кандидата в помощники — используется и при добавлении
// нового, и при замене уже вызванного (docs/00_DECISIONS.md, A9): один и тот
// же набор правил, чтобы они не разошлись между addDrawHelper/replaceDrawHelper.
async function resolveHelperSource(
  heat: { id: string; roundId: string; divisionId: string },
  competitionId: string,
  registrationId: string,
  role: RegistrationRole
): Promise<HelperSource> {
  const helperReg = await prisma.registration.findUniqueOrThrow({
    where: { id: registrationId },
    include: { checkIn: true },
  });
  if (helperReg.competitionId !== competitionId) {
    throw new ValidationFailedError("Помощник должен быть зарегистрирован в этом же соревновании.");
  }
  if (helperReg.status !== "REGISTERED") {
    throw new ValidationFailedError('Помощник должен быть в статусе "Зарегистрирован".');
  }
  if (!helperReg.checkIn || !["CHECKED_IN", "LATE"].includes(helperReg.checkIn.status)) {
    throw new ValidationFailedError("Помощник должен пройти check-in.");
  }
  if (helperReg.role !== role) {
    throw new ValidationFailedError("Роль помощника в заходе должна совпадать с его собственной ролью регистрации.");
  }

  if (helperReg.divisionId === heat.divisionId) {
    const alreadyScored = await prisma.drawParticipant.findFirst({
      where: { registrationId, scored: true, draw: { heat: { roundId: heat.roundId, id: { not: heat.id } } } },
    });
    if (!alreadyScored) {
      throw new ValidationFailedError(
        "Участник своего дивизиона может помогать только после того, как уже станцевал (получил оценку) в другом заходе этого раунда."
      );
    }
    return "REUSED_ALREADY_SCORED";
  }
  return "GUEST_HIGHER_CATEGORY";
}

export async function addDrawHelper(
  heatId: string,
  registrationId: string,
  role: RegistrationRole
): Promise<{ id: string }> {
  const heat = await prisma.heat.findUniqueOrThrow({
    where: { id: heatId },
    include: {
      round: { include: { division: { select: { id: true, competitionId: true } } } },
      draws: { orderBy: { version: "desc" }, take: 1 },
    },
  });
  const competitionId = heat.round.division.competitionId;
  const actor = await requirePermission("draw:override", competitionId);

  if (heat.round.status !== "DRAWING") {
    throw new ValidationFailedError('Добавлять помощников можно только пока раунд в статусе "Жеребьёвка".');
  }
  if (heat.status !== "PENDING") {
    throw new ValidationFailedError("Заход уже запущен — список нельзя менять.");
  }
  const draw = heat.draws[0];
  if (!draw) {
    throw new ValidationFailedError("Для этого захода ещё не сформирован список — сначала запустите жеребьёвку раунда.");
  }

  const helperSource = await resolveHelperSource(
    { id: heatId, roundId: heat.roundId, divisionId: heat.round.divisionId },
    competitionId,
    registrationId,
    role
  );

  const existing = await prisma.drawParticipant.findUnique({
    where: { drawId_registrationId: { drawId: draw.id, registrationId } },
  });
  if (existing) {
    throw new ValidationFailedError("Этот участник уже в списке этого захода.");
  }

  const maxOrder = await prisma.drawParticipant.aggregate({ where: { drawId: draw.id }, _max: { calledOrder: true } });
  const calledOrder = (maxOrder._max.calledOrder ?? 0) + 1;

  const created = await prisma.$transaction(async (tx) => {
    const participant = await tx.drawParticipant.create({
      data: { drawId: draw.id, registrationId, role, scored: false, helperSource, calledOrder },
    });
    await writeAudit(tx, {
      actor,
      action: "draw_participant.add_helper",
      entityType: "DrawParticipant",
      entityId: participant.id,
      after: { heatId, drawId: draw.id, registrationId, role, helperSource },
    });
    return participant;
  });

  return { id: created.id };
}

export async function removeDrawHelper(drawParticipantId: string): Promise<void> {
  const participant = await prisma.drawParticipant.findUniqueOrThrow({
    where: { id: drawParticipantId },
    include: {
      draw: { include: { heat: { include: { round: { include: { division: { select: { competitionId: true } } } } } } } },
    },
  });
  const competitionId = participant.draw.heat.round.division.competitionId;
  const actor = await requirePermission("draw:override", competitionId);

  if (!participant.helperSource) {
    throw new ValidationFailedError(
      "Можно убрать только помощника, не основного участника жеребьёвки — для этого используйте пересборку захода."
    );
  }
  if (participant.draw.heat.status !== "PENDING") {
    throw new ValidationFailedError("Заход уже запущен — список нельзя менять.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.drawParticipant.delete({ where: { id: drawParticipantId } });
    await writeAudit(tx, {
      actor,
      action: "draw_participant.remove_helper",
      entityType: "DrawParticipant",
      entityId: drawParticipantId,
      before: { registrationId: participant.registrationId, role: participant.role, helperSource: participant.helperSource },
    });
  });
}

// Заменить уже вызванного помощника на другого человека одним действием
// (вместо "убрать" + отдельно "добавить") — тот же слот (calledOrder), та
// же роль. Доступно только для помощников, не для основных (scored) —
// docs/00_DECISIONS.md, 2026-09-04.
export async function replaceDrawHelper(
  drawParticipantId: string,
  newRegistrationId: string
): Promise<{ id: string }> {
  const participant = await prisma.drawParticipant.findUniqueOrThrow({
    where: { id: drawParticipantId },
    include: {
      draw: {
        include: { heat: { include: { round: { include: { division: { select: { id: true, competitionId: true } } } } } } },
      },
    },
  });
  const heat = participant.draw.heat;
  const competitionId = heat.round.division.competitionId;
  const actor = await requirePermission("draw:override", competitionId);

  if (!participant.helperSource) {
    throw new ValidationFailedError(
      "Заменить можно только помощника, не основного участника жеребьёвки — для этого используйте пересборку захода."
    );
  }
  if (heat.round.status !== "DRAWING") {
    throw new ValidationFailedError('Менять список можно только пока раунд в статусе "Жеребьёвка".');
  }
  if (heat.status !== "PENDING") {
    throw new ValidationFailedError("Заход уже запущен — список нельзя менять.");
  }
  if (newRegistrationId === participant.registrationId) {
    throw new ValidationFailedError("Это тот же самый участник.");
  }

  const helperSource = await resolveHelperSource(
    { id: heat.id, roundId: heat.roundId, divisionId: heat.round.divisionId },
    competitionId,
    newRegistrationId,
    participant.role
  );

  const existing = await prisma.drawParticipant.findUnique({
    where: { drawId_registrationId: { drawId: participant.drawId, registrationId: newRegistrationId } },
  });
  if (existing) {
    throw new ValidationFailedError("Этот участник уже в списке этого захода.");
  }

  const created = await prisma.$transaction(async (tx) => {
    const next = await tx.drawParticipant.create({
      data: {
        drawId: participant.drawId,
        registrationId: newRegistrationId,
        role: participant.role,
        scored: false,
        helperSource,
        calledOrder: participant.calledOrder,
      },
    });
    await tx.drawParticipant.delete({ where: { id: drawParticipantId } });
    await writeAudit(tx, {
      actor,
      action: "draw_participant.replace_helper",
      entityType: "DrawParticipant",
      entityId: next.id,
      before: { registrationId: participant.registrationId, helperSource: participant.helperSource },
      after: { registrationId: newRegistrationId, helperSource },
    });
    return next;
  });

  return { id: created.id };
}
