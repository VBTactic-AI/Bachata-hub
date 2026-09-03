import crypto from "node:crypto";
import type { Prisma, RegistrationRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "../rbac/authorize";
import { writeAudit } from "../audit/audit";
import { ValidationFailedError } from "../errors";
import type { Actor } from "../rbac/actor";

type PrismaTx = Prisma.TransactionClient;
export type CallOrder = "SEQUENTIAL" | "RANDOM";

// Версионируется как CompetitionRules (A1) — старые результаты не должны
// внезапно пересчитываться по новому алгоритму (CLAUDE.md §50).
export const DRAW_ALGORITHM_VERSION = "v1";

function generateSeed(): string {
  return crypto.randomBytes(8).toString("hex");
}

// mulberry32 — маленький детерминированный PRNG: тот же seed всегда даёт ту
// же последовательность (CLAUDE.md §6 — жеребьёвка обязана быть
// воспроизводимой, "не просто Math.random() без сохранения результата").
function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(arr: T[], seedHex: string): T[] {
  const seedNum = parseInt(seedHex.slice(0, 8), 16);
  const rng = mulberry32(seedNum);
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function getDrawCallOrder(config: Prisma.JsonValue): CallOrder | null {
  if (config && typeof config === "object" && !Array.isArray(config) && "drawCallOrder" in config) {
    const value = (config as Record<string, unknown>).drawCallOrder;
    if (value === "SEQUENTIAL" || value === "RANDOM") return value;
  }
  return null;
}

type RegistrationWithCheckIn = { id: string; checkIn: { bibNumber: string | null } | null };

async function orderedEligiblePool(
  tx: PrismaTx,
  params: { divisionId: string; role: RegistrationRole; excludeIds: Set<string>; callOrder: CallOrder; seed: string | null }
): Promise<RegistrationWithCheckIn[]> {
  const regs = await tx.registration.findMany({
    where: {
      divisionId: params.divisionId,
      role: params.role,
      status: "REGISTERED",
      checkIn: { is: { status: { in: ["CHECKED_IN", "LATE"] } } },
    },
    include: { checkIn: { select: { bibNumber: true } } },
  });
  const eligible = regs.filter((r) => !params.excludeIds.has(r.id));
  if (params.callOrder === "SEQUENTIAL") {
    return eligible.sort((a, b) => Number(a.checkIn?.bibNumber ?? 0) - Number(b.checkIn?.bibNumber ?? 0));
  }
  return seededShuffle(eligible, params.seed!);
}

// Кто уже вызывался и получил scored=true в ДРУГИХ заездах этого раунда —
// такие люди исключаются из пула (уже отработали свою попытку в этом
// раунде). Считаем только ПОСЛЕДНЮЮ версию Draw каждого заезда — старые
// (пересобранные) версии не должны влиять на текущее состояние.
async function alreadyScoredElsewhereInRound(tx: PrismaTx, roundId: string, excludeHeatId: string): Promise<Set<string>> {
  const heats = await tx.heat.findMany({
    where: { roundId, id: { not: excludeHeatId } },
    select: {
      draws: {
        orderBy: { version: "desc" },
        take: 1,
        select: { participants: { where: { scored: true }, select: { registrationId: true } } },
      },
    },
  });
  const ids = heats.flatMap((h) => h.draws[0]?.participants.map((p) => p.registrationId) ?? []);
  return new Set(ids);
}

// Гости для авто-добора при дисбалансе — каскадом ЧЕРЕЗ КАЖДУЮ категорию
// строго выше по уровню, от ближайшей к дальней (не только ближайшую) —
// докладываем до нужного количества, переходя выше, пока не наберём или не
// кончатся категории (docs/00_DECISIONS.md, A10, уточнено 2026-09-04). Ниже
// своей категории автоматически НЕ спускаемся — это уже не "гость
// повыше", а отдельное решение, которое должен подтвердить организатор
// (см. formDrawInTx: после этого пробуем ещё переиспользовать своих, и
// только если и там пусто — заезд остаётся разбалансированным, добор ниже
// доступен только вручную через "+ Помощник").
async function pickHigherCategoryHelpers(
  tx: PrismaTx,
  params: {
    competitionId: string;
    ownDivisionId: string;
    ownCategoryOrder: number;
    role: RegistrationRole;
    count: number;
  }
): Promise<string[]> {
  if (params.count <= 0) return [];

  const divisions = await tx.division.findMany({
    where: { competitionId: params.competitionId, id: { not: params.ownDivisionId } },
    select: { id: true, category: { select: { order: true } } },
  });
  const higher = divisions
    .filter((d) => d.category.order > params.ownCategoryOrder)
    .sort((a, b) => a.category.order - b.category.order);

  const picked: string[] = [];
  for (const division of higher) {
    if (picked.length >= params.count) break;
    const regs = await tx.registration.findMany({
      where: {
        divisionId: division.id,
        role: params.role,
        status: "REGISTERED",
        checkIn: { is: { status: { in: ["CHECKED_IN", "LATE"] } } },
      },
      select: { id: true },
    });
    for (const r of regs) {
      if (picked.length >= params.count) break;
      picked.push(r.id);
    }
  }
  return picked;
}

// Второй шаг каскада: переиспользовать СВОИХ, кто уже станцевал (получил
// scored=true) в другом заезде этого раунда — только после того, как
// категорий выше совсем не осталось (или там никого подходящего нет).
function pickOwnDivisionReuseHelpers(
  tx: PrismaTx,
  params: { divisionId: string; role: RegistrationRole; alreadyScoredIds: Set<string>; count: number }
): Promise<{ id: string }[]> {
  if (params.count <= 0 || params.alreadyScoredIds.size === 0) return Promise.resolve([]);
  return tx.registration.findMany({
    where: {
      divisionId: params.divisionId,
      role: params.role,
      status: "REGISTERED",
      id: { in: [...params.alreadyScoredIds] },
    },
    select: { id: true },
    take: params.count,
  });
}

// Формирует список вызванных для ОДНОГО заезда — общее ядро и для первой
// раскладки раунда (вызывается по кругу для каждого заезда), и для
// пересборки (reroll) одного заезда отдельно. Пары НЕ назначаются — только
// список, кого вызвали (docs/00_DECISIONS.md, A5).
export async function formDrawInTx(
  tx: PrismaTx,
  params: {
    heatId: string;
    roundId: string;
    divisionId: string;
    heatCapacity: number;
    callOrder: CallOrder;
    actor: Actor;
    reason?: string;
  }
): Promise<{ id: string; leaderCount: number; followerCount: number }> {
  const { heatId, roundId, divisionId, heatCapacity, callOrder, actor, reason } = params;

  const lastDraw = await tx.draw.findFirst({ where: { heatId }, orderBy: { version: "desc" } });
  const version = (lastDraw?.version ?? 0) + 1;
  if (version > 1 && !reason) {
    // Пересборка (reroll) — обязана иметь причину (CLAUDE.md §6/§24).
    throw new ValidationFailedError("Пересборка жеребьёвки требует указать причину.");
  }

  const seed = callOrder === "RANDOM" ? generateSeed() : null;
  const excludeIds = await alreadyScoredElsewhereInRound(tx, roundId, heatId);

  const leaders = (
    await orderedEligiblePool(tx, { divisionId, role: "LEADER", excludeIds, callOrder, seed })
  ).slice(0, heatCapacity);
  const followers = (
    await orderedEligiblePool(tx, { divisionId, role: "FOLLOWER", excludeIds, callOrder, seed })
  ).slice(0, heatCapacity);

  const draw = await tx.draw.create({
    data: { heatId, version, seed, algorithmVersion: DRAW_ALGORITHM_VERSION, createdById: actor.userId, reason },
  });

  let calledOrder = 1;
  for (const reg of leaders) {
    await tx.drawParticipant.create({
      data: { drawId: draw.id, registrationId: reg.id, role: "LEADER", scored: true, calledOrder: calledOrder++ },
    });
  }
  for (const reg of followers) {
    await tx.drawParticipant.create({
      data: { drawId: draw.id, registrationId: reg.id, role: "FOLLOWER", scored: true, calledOrder: calledOrder++ },
    });
  }

  // Авто-добор помощников сразу при жеребьёвке, без подтверждения — по
  // явному запросу пользователя (2026-09-04, уточнено там же). Каскад:
  // 1) категории строго выше, одна за другой, от ближайшей к дальней;
  // 2) если категорий выше больше нет (или там никого не набралось) —
  //    переиспользуем своих, кто уже станцевал в другом заезде раунда;
  // 3) если и это не покрыло нехватку — заезд остаётся разбалансированным,
  //    спускаться в категории НИЖЕ автоматически нельзя — это уже решение,
  //    которое организатор подтверждает вручную через "+ Помощник" (там
  //    подсказка сама предложит ближайшую ниже, если выше и правда нет).
  const autoHelpers: { registrationId: string; helperSource: "GUEST_HIGHER_CATEGORY" | "REUSED_ALREADY_SCORED" }[] = [];
  if (leaders.length !== followers.length) {
    const needyRole: RegistrationRole = leaders.length < followers.length ? "LEADER" : "FOLLOWER";
    const shortage = Math.abs(leaders.length - followers.length);
    const division = await tx.division.findUniqueOrThrow({
      where: { id: divisionId },
      select: { competitionId: true, category: { select: { order: true } } },
    });

    const higherGuests = await pickHigherCategoryHelpers(tx, {
      competitionId: division.competitionId,
      ownDivisionId: divisionId,
      ownCategoryOrder: division.category.order,
      role: needyRole,
      count: shortage,
    });
    autoHelpers.push(...higherGuests.map((registrationId) => ({ registrationId, helperSource: "GUEST_HIGHER_CATEGORY" as const })));

    if (autoHelpers.length < shortage) {
      const reused = await pickOwnDivisionReuseHelpers(tx, {
        divisionId,
        role: needyRole,
        alreadyScoredIds: excludeIds,
        count: shortage - autoHelpers.length,
      });
      autoHelpers.push(...reused.map((r) => ({ registrationId: r.id, helperSource: "REUSED_ALREADY_SCORED" as const })));
    }

    for (const helper of autoHelpers) {
      await tx.drawParticipant.create({
        data: {
          drawId: draw.id,
          registrationId: helper.registrationId,
          role: needyRole,
          scored: false,
          helperSource: helper.helperSource,
          calledOrder: calledOrder++,
        },
      });
    }
  }
  const autoHelperIds = autoHelpers.map((h) => h.registrationId);

  await writeAudit(tx, {
    actor,
    action: "draw.create",
    entityType: "Draw",
    entityId: draw.id,
    after: {
      heatId,
      version,
      seed,
      algorithmVersion: DRAW_ALGORITHM_VERSION,
      callOrder,
      leaderCount: leaders.length,
      followerCount: followers.length,
      leaderIds: leaders.map((r) => r.id),
      followerIds: followers.map((r) => r.id),
      autoHelperIds,
    },
    reason,
  });

  return { id: draw.id, leaderCount: leaders.length, followerCount: followers.length };
}

// Пересобрать список ОДНОГО заезда отдельно (не всего раунда сразу) —
// доступно, пока заезд не запущен, всегда с указанием причины
// (docs/00_DECISIONS.md: "можно всегда, пока заезд не запущен").
export async function rerollHeatDraw(
  heatId: string,
  reason: string
): Promise<{ id: string; leaderCount: number; followerCount: number }> {
  const heat = await prisma.heat.findUniqueOrThrow({
    where: { id: heatId },
    include: { round: { include: { division: { select: { id: true, competitionId: true, heatCapacity: true } } } } },
  });
  const competitionId = heat.round.division.competitionId;
  const actor = await requirePermission("draw:reroll", competitionId);

  if (heat.round.status !== "DRAWING") {
    throw new ValidationFailedError('Пересобрать жеребьёвку можно только пока раунд в статусе "Жеребьёвка".');
  }
  if (heat.status !== "PENDING") {
    throw new ValidationFailedError("Пересобрать жеребьёвку можно только для ещё не запущенного заезда.");
  }
  const callOrder = getDrawCallOrder(heat.round.config) ?? "RANDOM";
  const heatCapacity = heat.round.heatCapacity ?? heat.round.division.heatCapacity;

  return prisma.$transaction((tx) =>
    formDrawInTx(tx, {
      heatId,
      roundId: heat.roundId,
      divisionId: heat.round.division.id,
      heatCapacity,
      callOrder,
      actor,
      reason,
    })
  );
}
