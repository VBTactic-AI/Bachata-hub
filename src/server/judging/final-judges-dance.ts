import type { Prisma, RegistrationRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "../rbac/authorize";
import { writeAudit } from "../audit/audit";
import { ValidationFailedError } from "../errors";
import { getRoundEligiblePool, pickHigherCategoryHelpers } from "../competition/draw-engine";
import { oppositeRole } from "./final-scoring-matrix";

type PrismaTx = Prisma.TransactionClient;

// JUDGES_DANCE (промт пользователя, п.22-24, доработано 2026-09-10) — две
// стадии, роль за ролью: стадия 1 — ведущие финалисты танцуют (судьи-Ведомые
// физически партнёрят и оценивают "танцующего" судью критерии, судьи-Ведущие
// смотрят со стороны и оценивают остальные); стадия 2 — зеркально, ведомые
// финалистки танцуют с судьями-Ведущими. Формально Draw Engine здесь
// участвует (Heat/Draw/DrawParticipant — те же модели, что и у обычных
// раундов, чтобы получить тот же UI/стиль жеребьёвки, CLAUDE.md §64), но
// "партнёр" участника — не другой финалист, а реальный назначенный судья
// (JudgeAssignment) противоположной роли, который в Draw Engine не хранится
// вовсе (у него может не быть Registration в этой категории). DrawParticipant
// противоположной роли в заходе — это только судьи-ПОМОЩНИКИ (scored=false),
// подставленные, когда реальных назначенных судей не хватает на всех
// финалистов захода физически.
const STAGE_ROLE: Record<1 | 2, RegistrationRole> = { 1: "LEADER", 2: "FOLLOWER" };
const ROLE_LABEL: Record<RegistrationRole, string> = { LEADER: "Партнёры", FOLLOWER: "Партнёрши" };

// Переиспользуется и final-random-couples.ts — та же эксклюзивность
// паркета нужна там для первой пары.
export async function assertNoOtherHeatActive(tx: PrismaTx, competitionId: string): Promise<void> {
  // Та же эксклюзивность паркета, что и transitionHeat() для обычных
  // заездов (docs/00_DECISIONS.md, A4) — здесь заход стартует не сразу
  // (см. generateJudgesDanceStage ниже — заходы создаются PENDING и
  // запускаются вручную через обычный transitionHeat, который сам проверяет
  // эксклюзивность), но final-random-couples.ts всё ещё создаёт заход сразу
  // RUNNING, поэтому проверка здесь остаётся нужна ЕМУ.
  const activeElsewhere = await tx.heat.findFirst({
    where: { status: { in: ["RUNNING", "PAUSED"] }, round: { division: { competitionId } } },
  });
  if (activeElsewhere) {
    throw new ValidationFailedError("Нельзя начать эту стадию: сейчас уже идёт (или на паузе) другой заход этого соревнования — сначала завершите его.");
  }
}

type HelperPick = { registrationId: string; helperSource: "GUEST_HIGHER_CATEGORY" | "SAME_CATEGORY_NON_FINALIST" | "OWN_FINAL_OPPOSITE_ROLE" };

// Каскад судей-партнёров "на помощь", когда реальных назначенных судей
// (JudgeAssignment) противоположной роли не хватает физически на всех
// финалистов захода. Порядок — по прямому запросу пользователя, 2026-09-10
// (отличается от обычного fillHelperShortage: там "свои уже станцевавшие ->
// категория выше", здесь "категория выше -> своя категория (не прошедшие в
// финал) -> финалисты противоположной роли этого же финала, ещё ждущие своей
// стадии"). Возвращает общий пул кандидатов на ВСЮ стадию — вызывающий код
// разбирает его по заходам последовательно (splice), чтобы один и тот же
// человек не попал в два захода подряд, пока кандидатов хватает.
async function buildJudgesDanceHelperPool(
  tx: PrismaTx,
  params: { competitionId: string; divisionId: string; categoryOrder: number; judgeRole: RegistrationRole; roundOrder: number; totalNeeded: number }
): Promise<HelperPick[]> {
  if (params.totalNeeded <= 0) return [];
  const pool: HelperPick[] = [];

  // Уровень 1 — категория выше (переиспользует тот же каскад, что и обычная
  // жеребьёвка, draw-engine.ts).
  const higher = await pickHigherCategoryHelpers(tx, {
    competitionId: params.competitionId,
    ownDivisionId: params.divisionId,
    ownCategoryOrder: params.categoryOrder,
    role: params.judgeRole,
    count: params.totalNeeded,
  });
  pool.push(...higher.map((registrationId) => ({ registrationId, helperSource: "GUEST_HIGHER_CATEGORY" as const })));
  if (pool.length >= params.totalNeeded) return pool;

  // Финалисты противоположной роли этого же финала (нужны и для уровня 2 —
  // исключить их из "не прошедших в финал" — и для уровня 3 ниже).
  const finalistIds = await getRoundEligiblePool(tx, { divisionId: params.divisionId, roundOrder: params.roundOrder, role: params.judgeRole });

  // Уровень 2 — своя категория, НЕ прошедшие в этот финал.
  const ownRegs = await tx.registration.findMany({
    where: {
      divisionId: params.divisionId,
      role: params.judgeRole,
      status: "REGISTERED",
      checkIn: { is: { status: { in: ["CHECKED_IN", "LATE"] } } },
      id: { notIn: [...finalistIds] },
    },
    select: { id: true, checkIn: { select: { bibNumber: true } } },
  });
  ownRegs.sort((a, b) => Number(a.checkIn?.bibNumber ?? 0) - Number(b.checkIn?.bibNumber ?? 0));
  for (const r of ownRegs) {
    if (pool.length >= params.totalNeeded) break;
    pool.push({ registrationId: r.id, helperSource: "SAME_CATEGORY_NON_FINALIST" });
  }
  if (pool.length >= params.totalNeeded) return pool;

  // Уровень 3 — финалисты противоположной роли этого же финала, ещё не
  // танцевавшие свою стадию (по прямому подтверждению пользователя,
  // 2026-09-10 — последний уровень каскада, а не первый).
  const ownFinalists = await tx.registration.findMany({
    where: { id: { in: [...finalistIds] } },
    select: { id: true, checkIn: { select: { bibNumber: true } } },
  });
  ownFinalists.sort((a, b) => Number(a.checkIn?.bibNumber ?? 0) - Number(b.checkIn?.bibNumber ?? 0));
  for (const r of ownFinalists) {
    if (pool.length >= params.totalNeeded) break;
    pool.push({ registrationId: r.id, helperSource: "OWN_FINAL_OPPOSITE_ROLE" });
  }
  return pool;
}

export type GenerateJudgesDanceStageResult = { stage: 1 | 2; heatIds: string[] };

// Сформировать список заходов ОДНОЙ стадии целиком (промт пользователя,
// 2026-09-10: "нажали начать 1 стадию — выпал список — настроили — начали").
// Заходы создаются PENDING (не RUNNING) — организатор проверяет/донабирает
// судей-помощников вручную (addJudgesDanceHelper/removeJudgesDanceHelper
// ниже), затем запускает каждый заход по очереди ОБЫЧНЫМ transitionHeat
// (heat-state.ts) — тот уже сам следит за очерёдностью номеров и
// эксклюзивностью паркета, отдельная проверка здесь не нужна.
export async function generateJudgesDanceStage(roundId: string): Promise<GenerateJudgesDanceStageResult> {
  const round = await prisma.round.findFirstOrThrow({
    where: { id: roundId },
    relationLoadStrategy: "join",
    include: {
      division: { select: { id: true, competitionId: true, heatCapacity: true, category: { select: { order: true } } } },
      finalSession: true,
      heats: { select: { id: true, number: true, status: true } },
    },
  });
  const actor = await requirePermission("final:manage", round.division.competitionId);

  if (!round.finalSession || round.finalSession.format !== "JUDGES_DANCE") {
    throw new ValidationFailedError("Это не финал формата «Танец с судьями».");
  }
  if (round.status === "COMPLETED") {
    throw new ValidationFailedError("Финал уже завершён.");
  }

  const currentStage = round.finalSession.currentStage;
  let stage: 1 | 2;
  if (currentStage === null) {
    if (round.heats.length > 0) {
      throw new ValidationFailedError("Список для первой стадии уже сформирован.");
    }
    stage = 1;
  } else if (currentStage === 1) {
    if (round.heats.length === 0) {
      throw new ValidationFailedError("Заходы первой стадии ещё не сформированы.");
    }
    if (round.heats.some((h) => h.status !== "FINISHED")) {
      throw new ValidationFailedError("Сначала завершите все заходы первой стадии — список второй стадии формируется после этого.");
    }
    stage = 2;
  } else {
    throw new ValidationFailedError("Список для этой стадии уже сформирован, либо финал уже завершён.");
  }

  const role = STAGE_ROLE[stage];
  const judgeRole = oppositeRole(role);
  const heatCapacity = round.heatCapacity ?? round.division.heatCapacity;
  const startNumber = round.heats.reduce((max, h) => Math.max(max, h.number), 0) + 1;

  return prisma.$transaction(async (tx) => {
    const eligibleIds = await getRoundEligiblePool(tx, { divisionId: round.division.id, roundOrder: round.order, role });
    const registrations = await tx.registration.findMany({
      where: { id: { in: [...eligibleIds] } },
      include: { checkIn: { select: { bibNumber: true } } },
    });
    registrations.sort((a, b) => Number(a.checkIn?.bibNumber ?? 0) - Number(b.checkIn?.bibNumber ?? 0));
    if (registrations.length === 0) {
      throw new ValidationFailedError(`Нет ни одного финалиста роли «${ROLE_LABEL[role]}» для этой стадии.`);
    }

    const judgesCount = await tx.judgeAssignment.count({ where: { divisionId: round.division.id, role: judgeRole } });

    const chunks: typeof registrations[] = [];
    for (let i = 0; i < registrations.length; i += heatCapacity) {
      chunks.push(registrations.slice(i, i + heatCapacity));
    }
    const totalNeeded = chunks.reduce((sum, c) => sum + Math.max(0, c.length - judgesCount), 0);
    const helperPool = await buildJudgesDanceHelperPool(tx, {
      competitionId: round.division.competitionId,
      divisionId: round.division.id,
      categoryOrder: round.division.category.order,
      judgeRole,
      roundOrder: round.order,
      totalNeeded,
    });

    const heatIds: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const heat = await tx.heat.create({ data: { roundId, number: startNumber + i, status: "PENDING" } });
      const draw = await tx.draw.create({
        data: {
          heatId: heat.id,
          version: 1,
          seed: null,
          algorithmVersion: "v1",
          createdById: actor.userId,
          reason: `Стадия ${stage} финала «Танец с судьями» (${ROLE_LABEL[role]}), заход ${i + 1} из ${chunks.length}.`,
        },
      });

      const needed = Math.max(0, chunk.length - judgesCount);
      const picked = helperPool.splice(0, needed);

      await tx.drawParticipant.createMany({
        data: [
          ...chunk.map((r, idx) => ({ drawId: draw.id, registrationId: r.id, role, scored: true, calledOrder: idx + 1 })),
          ...picked.map((p, idx) => ({
            drawId: draw.id,
            registrationId: p.registrationId,
            role: judgeRole,
            scored: false,
            helperSource: p.helperSource,
            calledOrder: chunk.length + idx + 1,
          })),
        ],
      });
      heatIds.push(heat.id);

      await writeAudit(tx, {
        actor,
        action: "judges_dance_stage.generate_heat",
        entityType: "Heat",
        entityId: heat.id,
        after: {
          stage,
          role,
          heatNumber: startNumber + i,
          finalistCount: chunk.length,
          realJudgesCount: judgesCount,
          helpersAdded: picked.length,
          helperSources: picked.map((p) => p.helperSource),
        },
        reason: `Сформирован список захода №${startNumber + i} стадии ${stage} финала «Танец с судьями».`,
      });
    }

    await tx.finalSession.update({ where: { id: round.finalSession!.id }, data: { currentStage: stage } });

    return { stage, heatIds };
  });
}

export type JudgesDanceHelperTier = { source: HelperPick["helperSource"]; label: string; registrations: { id: string; displayName: string; bibNumber: string | null }[] };

// Кандидаты для РУЧНОГО добавления/замены судьи-помощника в конкретном
// заходе (по прямому запросу пользователя, 2026-09-10 — "интерфейс
// изменения вручную на всякий случай надо оставить", поверх авто-заполнения
// при формировании списка выше). Те же 3 уровня, что и в
// buildJudgesDanceHelperPool, но только для ОДНОГО захода и без ограничения
// count — организатор сам решает, кого позвать.
export async function listJudgesDanceHelperCandidates(heatId: string): Promise<{ neededCount: number; tiers: JudgesDanceHelperTier[] }> {
  const heat = await prisma.heat.findFirstOrThrow({
    where: { id: heatId },
    relationLoadStrategy: "join",
    include: {
      round: { include: { division: { select: { id: true, competitionId: true, category: { select: { order: true } } } }, finalSession: true } },
      draws: { orderBy: { version: "desc" }, take: 1, select: { id: true, participants: { select: { role: true, registrationId: true } } } },
    },
  });
  const competitionId = heat.round.division.competitionId;
  await requirePermission("final:manage", competitionId);
  if (heat.round.finalSession?.format !== "JUDGES_DANCE") {
    throw new ValidationFailedError("Это не заход финала «Танец с судьями».");
  }

  const participants = heat.draws[0]?.participants ?? [];
  const role = (participants.find((p) => p.role === "LEADER") ? "LEADER" : "FOLLOWER") as RegistrationRole;
  const judgeRole = oppositeRole(role);
  const finalistCount = participants.filter((p) => p.role === role).length;
  const helperCount = participants.filter((p) => p.role === judgeRole).length;
  const judgesCount = await prisma.judgeAssignment.count({ where: { divisionId: heat.round.divisionId, role: judgeRole } });
  const neededCount = Math.max(0, finalistCount - judgesCount - helperCount);

  const excludeIds = new Set(participants.map((p) => p.registrationId));
  const finalistIds = await getRoundEligiblePool(prisma, { divisionId: heat.round.divisionId, roundOrder: heat.round.order, role: judgeRole });

  const higherIds = await pickHigherCategoryHelpers(prisma, {
    competitionId,
    ownDivisionId: heat.round.divisionId,
    ownCategoryOrder: heat.round.division.category.order,
    role: judgeRole,
    count: 100,
  });
  const ownNonFinalists = await prisma.registration.findMany({
    where: {
      divisionId: heat.round.divisionId,
      role: judgeRole,
      status: "REGISTERED",
      checkIn: { is: { status: { in: ["CHECKED_IN", "LATE"] } } },
      id: { notIn: [...finalistIds] },
    },
    include: { dancer: true, checkIn: { select: { bibNumber: true } } },
  });
  const ownFinalists = await prisma.registration.findMany({
    where: { id: { in: [...finalistIds] } },
    include: { dancer: true, checkIn: { select: { bibNumber: true } } },
  });
  const higherRegs = higherIds.length
    ? await prisma.registration.findMany({ where: { id: { in: higherIds } }, include: { dancer: true, checkIn: { select: { bibNumber: true } } } })
    : [];

  const toCandidate = (r: { id: string; dancer: { displayName: string }; checkIn: { bibNumber: string | null } | null }) => ({
    id: r.id,
    displayName: r.dancer.displayName,
    bibNumber: r.checkIn?.bibNumber ?? null,
  });
  const filterUsable = <T extends { id: string }>(rows: T[]) => rows.filter((r) => !excludeIds.has(r.id));

  const tiers: JudgesDanceHelperTier[] = [
    { source: "GUEST_HIGHER_CATEGORY" as const, label: "Категория выше", registrations: filterUsable(higherRegs).map(toCandidate) },
    { source: "SAME_CATEGORY_NON_FINALIST" as const, label: "Своя категория · не прошли в финал", registrations: filterUsable(ownNonFinalists).map(toCandidate) },
    { source: "OWN_FINAL_OPPOSITE_ROLE" as const, label: "Финалисты этого финала · ждут своей стадии", registrations: filterUsable(ownFinalists).map(toCandidate) },
  ].filter((t) => t.registrations.length > 0);

  return { neededCount, tiers };
}

// Добавить ОДНОГО судью-помощника вручную (см. listJudgesDanceHelperCandidates
// выше) — источник (helperSource) определяется по факту принадлежности
// человека, а не выбирается организатором, тем же способом, что и авто-каскад.
export async function addJudgesDanceHelper(heatId: string, registrationId: string): Promise<{ id: string }> {
  const heat = await prisma.heat.findFirstOrThrow({
    where: { id: heatId },
    relationLoadStrategy: "join",
    include: {
      round: { include: { division: { select: { id: true, competitionId: true, category: { select: { order: true } } } }, finalSession: true } },
      draws: { orderBy: { version: "desc" }, take: 1, include: { participants: true } },
    },
  });
  const competitionId = heat.round.division.competitionId;
  const actor = await requirePermission("final:manage", competitionId);
  if (heat.round.finalSession?.format !== "JUDGES_DANCE") {
    throw new ValidationFailedError("Это не заход финала «Танец с судьями».");
  }
  if (heat.status !== "PENDING") {
    throw new ValidationFailedError("Заход уже запущен — список нельзя менять.");
  }
  const draw = heat.draws[0];
  if (!draw) {
    throw new ValidationFailedError("Для этого захода ещё не сформирован список.");
  }

  const participants = draw.participants;
  const role = (participants.find((p) => p.role === "LEADER") ? "LEADER" : "FOLLOWER") as RegistrationRole;
  const judgeRole = oppositeRole(role);

  const registration = await prisma.registration.findUniqueOrThrow({ where: { id: registrationId }, include: { checkIn: true } });
  if (registration.competitionId !== competitionId) {
    throw new ValidationFailedError("Помощник должен быть зарегистрирован в этом же соревновании.");
  }
  if (registration.role !== judgeRole) {
    throw new ValidationFailedError("Роль помощника должна быть противоположной танцующим в этом заходе.");
  }
  if (registration.status !== "REGISTERED") {
    throw new ValidationFailedError('Помощник должен быть в статусе "Зарегистрирован".');
  }
  if (!registration.checkIn || !["CHECKED_IN", "LATE"].includes(registration.checkIn.status)) {
    throw new ValidationFailedError("Помощник должен пройти check-in.");
  }
  if (participants.some((p) => p.registrationId === registrationId)) {
    throw new ValidationFailedError("Этот участник уже в списке этого захода.");
  }

  let helperSource: HelperPick["helperSource"];
  if (registration.divisionId === heat.round.divisionId) {
    const finalistIds = await getRoundEligiblePool(prisma, { divisionId: heat.round.divisionId, roundOrder: heat.round.order, role: judgeRole });
    helperSource = finalistIds.has(registrationId) ? "OWN_FINAL_OPPOSITE_ROLE" : "SAME_CATEGORY_NON_FINALIST";
  } else {
    helperSource = "GUEST_HIGHER_CATEGORY";
  }

  const calledOrder = Math.max(0, ...participants.map((p) => p.calledOrder)) + 1;

  const created = await prisma.$transaction(async (tx) => {
    const participant = await tx.drawParticipant.create({
      data: { drawId: draw.id, registrationId, role: judgeRole, scored: false, helperSource, calledOrder },
    });
    await writeAudit(tx, {
      actor,
      action: "judges_dance_helper.add_manual",
      entityType: "DrawParticipant",
      entityId: participant.id,
      after: { heatId, drawId: draw.id, registrationId, role: judgeRole, helperSource },
    });
    return participant;
  });

  return { id: created.id };
}

// Убрать помощника — отдельной функции здесь не нужно: существующий
// removeDrawHelper (draw-helper.ts) проверяет только helperSource и
// heat.status==="PENDING" (без привязки к round.status или формату финала),
// поэтому уже корректно работает и для этих DrawParticipant — переиспользуем
// его же через существующий DELETE /api/draw-participants/[id]
// (RemoveDrawHelperButton), не дублируем логику.
