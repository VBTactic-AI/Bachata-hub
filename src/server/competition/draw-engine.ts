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
