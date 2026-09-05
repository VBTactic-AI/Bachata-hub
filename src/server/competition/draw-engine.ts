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
// Экспортируется отдельно (FLOW-005) — final-random-couples.ts переиспользует
// этот же PRNG вместо своего одноразового crypto.randomInt, чтобы сохранённый
// на FinalPair.seed реально позволял воспроизвести выбор пары, а не был
// декоративным.
export function mulberry32(seed: number): () => number {
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
  params: {
    divisionId: string;
    role: RegistrationRole;
    excludeIds: Set<string>;
    callOrder: CallOrder;
    seed: string | null;
    // Пул второго и следующих раундов дивизиона — только те, кто реально
    // прошёл предыдущий раунд (docs/00_DECISIONS.md, A13/A9 — раньше это
    // было неизбежным ограничением, Advancement Engine не существовал).
    // null — раунд не ограничен (первый раунд дивизиона), берём весь дивизион.
    onlyRegistrationIds: Set<string> | null;
  }
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
  const eligible = regs.filter(
    (r) => !params.excludeIds.has(r.id) && (params.onlyRegistrationIds === null || params.onlyRegistrationIds.has(r.id))
  );
  if (params.callOrder === "SEQUENTIAL") {
    return eligible.sort((a, b) => Number(a.checkIn?.bibNumber ?? 0) - Number(b.checkIn?.bibNumber ?? 0));
  }
  return seededShuffle(eligible, params.seed!);
}

// Ближайший ПРЕДЫДУЩИЙ обычный (не служебный тай-брейк) раунд дивизиона —
// именно на его RoundResult ссылаемся: recordTieBreakDecision обновляет
// статус там же, на родительском раунде, поэтому финальный исход (после
// разрешения возможной перетанцовки) виден именно тут, независимо от того,
// нужна ли была перетанцовка (docs/00_DECISIONS.md, A13).
async function advancedRegistrationIdsFromPreviousRound(
  tx: PrismaTx,
  divisionId: string,
  currentRoundOrder: number
): Promise<Set<string> | null> {
  const previous = await tx.round.findFirst({
    where: { divisionId, order: { lt: currentRoundOrder }, type: null },
    orderBy: { order: "desc" },
  });
  if (!previous || previous.status !== "COMPLETED") return null;

  const results = await tx.roundResult.findMany({
    where: { roundId: previous.id, status: "ADVANCED" },
    select: { registrationId: true },
  });
  return new Set(results.map((r) => r.registrationId));
}

// Полный пул раунда для одной роли — та же фильтрация, что использует сама
// жеребьёвка (CHECKED_IN/LATE + прошедшие предыдущий раунд, A9), но без
// вместимости заезда и без "уже вызван в другом заезде" — нужно, чтобы
// проверить, что ВСЕ подходящие попали хоть в какой-то заезд раунда, прежде
// чем зафиксировать жеребьёвку (docs/00_DECISIONS.md, 2026-09-04).
export async function getRoundEligiblePool(
  tx: PrismaTx,
  params: { divisionId: string; roundOrder: number; role: RegistrationRole }
): Promise<Set<string>> {
  const onlyRegistrationIds = await advancedRegistrationIdsFromPreviousRound(tx, params.divisionId, params.roundOrder);
  const regs = await tx.registration.findMany({
    where: {
      divisionId: params.divisionId,
      role: params.role,
      status: "REGISTERED",
      checkIn: { is: { status: { in: ["CHECKED_IN", "LATE"] } } },
    },
    select: { id: true },
  });
  const eligible = onlyRegistrationIds === null ? regs : regs.filter((r) => onlyRegistrationIds.has(r.id));
  return new Set(eligible.map((r) => r.id));
}

// Кто уже вызывался и получил scored=true в ДРУГИХ заездах этого раунда —
// такие люди исключаются из пула (уже отработали свою попытку в этом
// раунде). Считаем только ПОСЛЕДНЮЮ версию Draw каждого заезда — старые
// (пересобранные) версии не должны влиять на текущее состояние.
// CODE-001/CODE-002: экспортирована, чтобы draw-helper.ts
// (listHelperCandidates, resolveHelperSource) переиспользовала именно эту,
// версионно-корректную реализацию вместо собственной без фильтра "только
// последняя версия Draw" — без него ручной подбор помощника мог посчитать
// человека "уже станцевавшим" по данным пересобранного (устаревшего) захода.
// excludeHeatId опционален — advancement.ts/final-advancement.ts используют
// эту же функцию БЕЗ исключения (ищут по всему родительскому раунду перед
// созданием совершенно нового служебного захода-перетанцовки, которого ещё
// нет среди heats раунда), не поддерживая для этого отдельную копию запроса.
export async function alreadyScoredElsewhereInRound(
  tx: PrismaTx | typeof prisma,
  roundId: string,
  excludeHeatId?: string
): Promise<Set<string>> {
  const heats = await tx.heat.findMany({
    where: excludeHeatId ? { roundId, id: { not: excludeHeatId } } : { roundId },
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

// Переиспользовать СВОИХ, кто уже станцевал (получил scored=true) в другом
// заезде этого раунда.
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

type HelperSource = "GUEST_HIGHER_CATEGORY" | "REUSED_ALREADY_SCORED";
type HelperPick = { registrationId: string; helperSource: HelperSource };

// Общий каскад добора — порядок шагов НАСТРАИВАЕТСЯ, потому что в двух
// ситуациях он разный (docs/00_DECISIONS.md, A10, уточнено 2026-09-04):
// - при обычной жеребьёвке заезда: сначала категории выше, потом свои;
// - при разбивке заезда на два выхода (splitHeatOverflow): наоборот —
//   сначала свои, только что освободившиеся из первого выхода (они уже
//   физически рядом), потом каскад по категориям выше.
// Категории НИЖЕ своей сюда не входят никогда — это только ручное решение.
export async function fillHelperShortage(
  tx: PrismaTx,
  params: {
    competitionId: string;
    divisionId: string;
    categoryOrder: number;
    role: RegistrationRole;
    count: number;
    alreadyScoredIds: Set<string>;
    preferOwnFirst: boolean;
  }
): Promise<HelperPick[]> {
  const picks: HelperPick[] = [];

  async function tryHigher(remaining: number) {
    const ids = await pickHigherCategoryHelpers(tx, {
      competitionId: params.competitionId,
      ownDivisionId: params.divisionId,
      ownCategoryOrder: params.categoryOrder,
      role: params.role,
      count: remaining,
    });
    picks.push(...ids.map((registrationId) => ({ registrationId, helperSource: "GUEST_HIGHER_CATEGORY" as const })));
  }

  async function tryOwn(remaining: number) {
    const regs = await pickOwnDivisionReuseHelpers(tx, {
      divisionId: params.divisionId,
      role: params.role,
      alreadyScoredIds: params.alreadyScoredIds,
      count: remaining,
    });
    picks.push(...regs.map((r) => ({ registrationId: r.id, helperSource: "REUSED_ALREADY_SCORED" as const })));
  }

  if (params.preferOwnFirst) {
    await tryOwn(params.count);
    if (picks.length < params.count) await tryHigher(params.count - picks.length);
  } else {
    await tryHigher(params.count);
    if (picks.length < params.count) await tryOwn(params.count - picks.length);
  }

  return picks;
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
    // Порядок раунда в дивизионе — вызывающий код (startRoundDrawing,
    // rerollHeatDraw) уже загрузил Round целиком до вызова, повторный
    // round.findUniqueOrThrow тут был бы лишним round-trip'ом на КАЖДЫЙ heat
    // раунда (замерено: ~150мс каждый, см. schema.prisma).
    roundOrder: number;
    divisionId: string;
    heatCapacity: number;
    callOrder: CallOrder;
    actor: Actor;
    reason?: string;
  }
): Promise<{ id: string; leaderCount: number; followerCount: number }> {
  const { heatId, roundId, roundOrder, divisionId, heatCapacity, callOrder, actor, reason } = params;

  const lastDraw = await tx.draw.findFirst({ where: { heatId }, orderBy: { version: "desc" } });
  const version = (lastDraw?.version ?? 0) + 1;
  if (version > 1 && !reason) {
    // Пересборка (reroll) — обязана иметь причину (CLAUDE.md §6/§24).
    throw new ValidationFailedError("Пересборка жеребьёвки требует указать причину.");
  }

  const seed = callOrder === "RANDOM" ? generateSeed() : null;
  const excludeIds = await alreadyScoredElsewhereInRound(tx, roundId, heatId);
  const onlyRegistrationIds = await advancedRegistrationIdsFromPreviousRound(tx, divisionId, roundOrder);

  const leaders = (
    await orderedEligiblePool(tx, { divisionId, role: "LEADER", excludeIds, callOrder, seed, onlyRegistrationIds })
  ).slice(0, heatCapacity);
  const followers = (
    await orderedEligiblePool(tx, { divisionId, role: "FOLLOWER", excludeIds, callOrder, seed, onlyRegistrationIds })
  ).slice(0, heatCapacity);

  const draw = await tx.draw.create({
    data: { heatId, version, seed, algorithmVersion: DRAW_ALGORITHM_VERSION, createdById: actor.userId, reason },
  });

  // Список вызванных вставляется ОДНИМ batch-запросом (createMany), а не по
  // одному create() на человека — на удалённой БД (Supabase pooler, ~150мс
  // round-trip) заезд на 10-16 человек иначе стоил бы 10-16 отдельных
  // round-trip'ов только на этот шаг (подтверждено pg_stat_statements:
  // единичные INSERT INTO DrawParticipant выполняются на Postgres <1мс —
  // время целиком уходит на сетевые round-trip'ы, не на саму вставку).
  // calledOrder сохраняет тот же порядок, что и раньше: сначала ведущие,
  // потом ведомые.
  const leaderRows = leaders.map((reg, i) => ({
    drawId: draw.id,
    registrationId: reg.id,
    role: "LEADER" as const,
    scored: true,
    calledOrder: i + 1,
  }));
  const followerRows = followers.map((reg, i) => ({
    drawId: draw.id,
    registrationId: reg.id,
    role: "FOLLOWER" as const,
    scored: true,
    calledOrder: leaders.length + i + 1,
  }));

  // Авто-добор помощников сразу при жеребьёвке, без подтверждения — по
  // явному запросу пользователя (2026-09-04, уточнено там же). Каскад:
  // 1) категории строго выше, одна за другой, от ближайшей к дальней;
  // 2) если категорий выше больше нет (или там никого не набралось) —
  //    переиспользуем своих, кто уже станцевал в другом заезде раунда;
  // 3) если и это не покрыло нехватку — заезд остаётся разбалансированным,
  //    спускаться в категории НИЖЕ автоматически нельзя — это уже решение,
  //    которое организатор подтверждает вручную через "+ Помощник" (там
  //    подсказка сама предложит ближайшую ниже, если выше и правда нет).
  let autoHelpers: HelperPick[] = [];
  let helperRows: { drawId: string; registrationId: string; role: RegistrationRole; scored: boolean; helperSource: HelperSource; calledOrder: number }[] = [];
  if (leaders.length !== followers.length) {
    const needyRole: RegistrationRole = leaders.length < followers.length ? "LEADER" : "FOLLOWER";
    const shortage = Math.abs(leaders.length - followers.length);
    const division = await tx.division.findUniqueOrThrow({
      where: { id: divisionId },
      select: { competitionId: true, category: { select: { order: true } } },
    });

    autoHelpers = await fillHelperShortage(tx, {
      competitionId: division.competitionId,
      divisionId,
      categoryOrder: division.category.order,
      role: needyRole,
      count: shortage,
      alreadyScoredIds: excludeIds,
      preferOwnFirst: false,
    });

    helperRows = autoHelpers.map((helper, i) => ({
      drawId: draw.id,
      registrationId: helper.registrationId,
      role: needyRole,
      scored: false,
      helperSource: helper.helperSource,
      calledOrder: leaderRows.length + followerRows.length + i + 1,
    }));
  }
  const autoHelperIds = autoHelpers.map((h) => h.registrationId);

  // Один batch-insert на весь список заезда (основные + помощники) — см.
  // комментарий выше про round-trip'ы.
  await tx.drawParticipant.createMany({ data: [...leaderRows, ...followerRows, ...helperRows] });

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
    relationLoadStrategy: "join",
    include: { round: { include: { division: { select: { id: true, competitionId: true, heatCapacity: true } } } } },
  });
  const competitionId = heat.round.division.competitionId;
  const actor = await requirePermission("draw:reroll", competitionId);

  if (heat.round.status !== "DRAWING") {
    throw new ValidationFailedError('Пересобрать жеребьёвку можно только пока раунд в статусе "Жеребьёвка".');
  }
  if (heat.status !== "PENDING") {
    throw new ValidationFailedError("Пересобрать жеребьёвку можно только для ещё не запущенного захода.");
  }
  const callOrder = getDrawCallOrder(heat.round.config) ?? "RANDOM";
  const heatCapacity = heat.round.heatCapacity ?? heat.round.division.heatCapacity;

  return prisma.$transaction((tx) =>
    formDrawInTx(tx, {
      heatId,
      roundId: heat.roundId,
      roundOrder: heat.round.order,
      divisionId: heat.round.division.id,
      heatCapacity,
      callOrder,
      actor,
      reason,
    })
  );
}

// Разбить заезд на два выхода ("Способ Б", обсуждалось отдельно от "Способ
// А" — помощь в рамках одного заезда): реальных (scored) участников
// избыточной стороны сверх баланса переносим в НОВЫЙ заезд ЭТОГО ЖЕ раунда,
// всех помощников текущего заезда удаляем совсем (не переносим — новый
// заезд ищет себе помощников заново), и сразу же добираем недостающую
// сторону нового заезда — но уже с ОБРАТНЫМ приоритетом каскада: сначала
// свои, только что освободившиеся из первого выхода, потом категории выше
// (docs/00_DECISIONS.md, A10, уточнено 2026-09-04).
export async function splitHeatOverflow(heatId: string): Promise<{ newHeatId: string }> {
  const heat = await prisma.heat.findUniqueOrThrow({
    where: { id: heatId },
    relationLoadStrategy: "join",
    include: {
      round: {
        include: {
          division: { select: { id: true, competitionId: true, category: { select: { order: true } } } },
        },
      },
    },
  });
  const competitionId = heat.round.division.competitionId;
  const actor = await requirePermission("draw:override", competitionId);

  if (heat.round.status !== "DRAWING") {
    throw new ValidationFailedError('Разбить заход можно только пока раунд в статусе "Жеребьёвка".');
  }
  if (heat.status !== "PENDING") {
    throw new ValidationFailedError("Заход уже запущен — список нельзя менять.");
  }

  const draw = await prisma.draw.findFirst({
    where: { heatId },
    orderBy: { version: "desc" },
    include: { participants: true },
  });
  if (!draw) {
    throw new ValidationFailedError("Для этого захода ещё не сформирован список — сначала запустите жеребьёвку раунда.");
  }

  const real = draw.participants.filter((p) => p.scored);
  const helpers = draw.participants.filter((p) => !p.scored);
  const leaders = real.filter((p) => p.role === "LEADER").sort((a, b) => a.calledOrder - b.calledOrder);
  const followers = real.filter((p) => p.role === "FOLLOWER").sort((a, b) => a.calledOrder - b.calledOrder);

  if (leaders.length === followers.length) {
    throw new ValidationFailedError("Заход уже сбалансирован — разбивать нечего.");
  }

  const balancedCount = Math.min(leaders.length, followers.length);
  // Если меньшая сторона — 0 реальных участников, разбивка унесла бы ВСЕХ
  // реальных в новый заезд, а текущий остался бы пустым (все помощники при
  // разбивке удаляются) — по запросу пользователя (2026-09-04) такое
  // запрещено явно, а не молча создаёт бесполезный пустой заезд.
  if (balancedCount === 0) {
    throw new ValidationFailedError(
      "Нельзя разбить: в заходе нет ни одного реального представителя противоположной роли — заход после разбивки останется пустым."
    );
  }
  const excessRole: RegistrationRole = leaders.length > followers.length ? "LEADER" : "FOLLOWER";
  const needyRole: RegistrationRole = excessRole === "LEADER" ? "FOLLOWER" : "LEADER";
  const moved = (excessRole === "LEADER" ? leaders : followers).slice(balancedCount);

  return prisma.$transaction(async (tx) => {
    // 1. убрать лишних (переносятся в новый заезд) и ВСЕХ помощников
    // (удаляются совсем, не переносятся) из текущего заезда.
    const removeIds = [...moved.map((p) => p.id), ...helpers.map((p) => p.id)];
    if (removeIds.length > 0) {
      await tx.drawParticipant.deleteMany({ where: { id: { in: removeIds } } });
    }
    await writeAudit(tx, {
      actor,
      action: "heat.split_overflow",
      entityType: "Heat",
      entityId: heatId,
      after: {
        movedRegistrationIds: moved.map((p) => p.registrationId),
        removedHelperRegistrationIds: helpers.map((p) => p.registrationId),
      },
    });

    // 2. новый заезд в этом же раунде.
    const lastHeat = await tx.heat.findFirst({ where: { roundId: heat.roundId }, orderBy: { number: "desc" } });
    const newHeat = await tx.heat.create({ data: { roundId: heat.roundId, number: (lastHeat?.number ?? 0) + 1 } });
    await writeAudit(tx, {
      actor,
      action: "heat.create",
      entityType: "Heat",
      entityId: newHeat.id,
      after: { roundId: heat.roundId, number: newHeat.number, splitFromHeatId: heatId },
    });

    // 3. новый Draw версии 1 с перенесёнными людьми (не пересобирается
    // заново — это конкретные люди, которым не хватило пары в первом выходе).
    const newDraw = await tx.draw.create({
      data: { heatId: newHeat.id, version: 1, seed: null, algorithmVersion: DRAW_ALGORITHM_VERSION, createdById: actor.userId },
    });
    const movedRows = moved.map((p, i) => ({
      drawId: newDraw.id,
      registrationId: p.registrationId,
      role: p.role,
      scored: true,
      calledOrder: i + 1,
    }));

    // 4. авто-добор недостающей стороны нового заезда — приоритет ОБРАТНЫЙ
    // обычному (сначала свои, потом каскад выше), см. fillHelperShortage.
    const alreadyScoredIds = await alreadyScoredElsewhereInRound(tx, heat.roundId, newHeat.id);
    const autoHelpers = await fillHelperShortage(tx, {
      competitionId,
      divisionId: heat.round.division.id,
      categoryOrder: heat.round.division.category.order,
      role: needyRole,
      count: moved.length,
      alreadyScoredIds,
      preferOwnFirst: true,
    });
    const helperRows = autoHelpers.map((helper, i) => ({
      drawId: newDraw.id,
      registrationId: helper.registrationId,
      role: needyRole,
      scored: false,
      helperSource: helper.helperSource,
      calledOrder: movedRows.length + i + 1,
    }));
    // Один batch-insert вместо create() по одному на человека (см. тот же
    // комментарий в formDrawInTx).
    await tx.drawParticipant.createMany({ data: [...movedRows, ...helperRows] });

    await writeAudit(tx, {
      actor,
      action: "draw.create",
      entityType: "Draw",
      entityId: newDraw.id,
      after: {
        heatId: newHeat.id,
        version: 1,
        movedFromHeatId: heatId,
        movedRegistrationIds: moved.map((p) => p.registrationId),
        autoHelperIds: autoHelpers.map((h) => h.registrationId),
      },
    });

    return { newHeatId: newHeat.id };
  });
}
