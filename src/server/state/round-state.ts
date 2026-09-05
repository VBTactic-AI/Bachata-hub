import type { Prisma, RoundStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { transition, type TransitionTable } from "./machine";
import { requirePermission } from "../rbac/authorize";
import type { Permission } from "../rbac/permissions";
import type { Actor } from "../rbac/actor";
import { ValidationFailedError } from "../errors";
import { ROUND_TYPE_LABELS } from "@/lib/competition-labels";
import { maybeCalculateOnEntryInTx } from "../judging/advancement";
import { maybeCalculateFinalOnEntryInTx } from "../judging/final-advancement";
import { writeAudit } from "../audit/audit";
import { getRoundEligiblePool } from "../competition/draw-engine";

type PrismaTx = Prisma.TransactionClient;

// Без RESUMED (docs/00_DECISIONS.md, A2).
// У раунда больше нет своей собственной кнопки "Пауза" (RUNNING -> PAUSED
// как ручной переход убран, по запросу пользователя 2026-09-04) — она
// путалась с паузой конкретного захода/ротации партнёров (разные, никак не
// связанные вещи) и вызвала реальный баг: раунд, поставленный на паузу,
// застревал, если его последний заход в этот момент завершался (заход эту
// паузу раунда не проверяет и не блокируется ей) — docs/00_DECISIONS.md, A17.
// Единственный реальный эффект паузы раунда — не дать стартовать следующий
// заход — и так достигается тем, что кнопку "Запустить" у захода просто не
// нажимают; отдельная кнопка была не нужна. RoundStatus.PAUSED остаётся в
// схеме БД (не мигрируем ради ещё не встречавшегося в проде значения), но
// эта таблица переходов в него больше не ведёт — недостижим через обычный UI.
// FINISHED и SCORING достижимы только автоматически, из
// autoAdvanceRoundIfAllHeatsFinishedInTx (по запросу пользователя,
// 2026-09-04: когда все заходы раунда оттанцевали, кнопка не нужна) —
// поэтому здесь у RUNNING/FINISHED нет этих целей: обычный
// /api/rounds/[id]/transition их применить не может, только сам этот
// сервис изнутри транзакции завершения захода. COMPLETED так же достижим
// только из advancement.ts (calculateRoundResultsInTx/recordTieBreakDecision)
// — иначе раунд мог бы "завершиться" без единой строки RoundResult
// (CLAUDE.md §45 — не голый PATCH статуса для операции с бизнес-смыслом).
const TABLE: TransitionTable<RoundStatus> = {
  DRAFT: ["READY"],
  READY: ["DRAWING"],
  DRAWING: ["DRAW_LOCKED"],
  DRAW_LOCKED: ["RUNNING"],
  RUNNING: [],
  PAUSED: [],
  FINISHED: [],
  SCORING: [],
  COMPLETED: [],
};

// Огрубление на этапе фундамента: точные права на "начать scoring"/
// "завершить scoring" появятся вместе со сервисом судейства. Пока — по
// ближайшему по смыслу праву из 03 §4.
function permissionFor(to: RoundStatus): Permission {
  switch (to) {
    case "READY":
      return "round:create";
    case "DRAWING":
      return "draw:generate";
    case "DRAW_LOCKED":
      return "draw:lock";
    case "FINISHED":
    case "COMPLETED":
      return "round:end";
    default:
      return "round:start";
  }
}

export async function transitionRound(
  roundId: string,
  to: RoundStatus,
  opts?: {
    reason?: string;
    // Доп. поля для того же UPDATE, что и смена статуса (напр. Round.config
    // с выбранным порядком вызова при старте жеребьёвки) — чтобы записать
    // их в одной транзакции с переходом, а не двумя отдельными запросами.
    extraData?: Prisma.RoundUncheckedUpdateManyInput;
    // Доп. работа внутри ТОЙ ЖЕ транзакции сразу после успешного перехода
    // (напр. Draw Engine формирует списки всех заездов раунда сразу же,
    // как только раунд перешёл в DRAWING) — используется start-round-drawing.ts.
    onApplied?: (tx: PrismaTx, actor: Actor) => Promise<void>;
  }
): Promise<void> {
  const round = await prisma.round.findUniqueOrThrow({
    where: { id: roundId },
    include: { division: { select: { id: true, competitionId: true } } },
  });
  const competitionId = round.division.competitionId;
  const actor = await requirePermission(permissionFor(to), competitionId);

  await transition({
    entityType: "Round",
    entityId: roundId,
    table: TABLE,
    currentStatus: round.status,
    statusVersion: round.statusVersion,
    to,
    actor,
    reason: opts?.reason,
    guard: async (tx) => {
      // FLOW-002: та же гонка, что и в heat-state.ts (A4) — здесь для
      // "раунды дивизиона по очереди" (A8/A13, RUNNING и DRAWING). Без
      // этой блокировки два РАЗНЫХ раунда одного дивизиона могли бы под
      // READ COMMITTED синхронно увидеть "предыдущий ещё не завершён? нет"
      // до коммита друг друга. Снимается сама в конце транзакции.
      if (to === "RUNNING" || to === "DRAWING") {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${round.division.id})::bigint)`;
      }
      // Жеребьёвка раунда обязана явно выбрать порядок вызова участников
      // (SEQUENTIAL/RANDOM) — это делает только start-round-drawing.ts,
      // передавая extraData; прямой переход в DRAWING без этого запрещён
      // (CLAUDE.md §45 — не голый PATCH статуса для операции с бизнес-смыслом).
      if (to === "DRAWING" && !opts?.extraData) {
        throw new ValidationFailedError(
          'Жеребьёвка раунда запускается отдельным действием "Начать жеребьёвку" (там же выбирается порядок вызова), не прямой сменой статуса.'
        );
      }
      // Нельзя зафиксировать жеребьёвку, пока не для каждого заезда раунда
      // сформирован список вызванных (docs/00_DECISIONS.md — "только когда у
      // каждого заезда есть список").
      if (to === "DRAW_LOCKED") {
        const heatWithoutDraw = await tx.heat.findFirst({
          where: { roundId, draws: { none: {} } },
          orderBy: { number: "asc" },
        });
        if (heatWithoutDraw) {
          throw new ValidationFailedError(
            `Нельзя зафиксировать жеребьёвку: для захода №${heatWithoutDraw.number} ещё не сформирован список вызванных.`
          );
        }

        // Внутри каждого захода — поровну ведущих и ведомых (реальных и
        // помощников вместе: помощник как раз и добавляется, чтобы у
        // кого-то физически был партнёр на паркете) — иначе кто-то
        // останется без пары (по запросу пользователя, 2026-09-04).
        const heats = await tx.heat.findMany({
          where: { roundId },
          orderBy: { number: "asc" },
          relationLoadStrategy: "join",
          include: { draws: { orderBy: { version: "desc" }, take: 1, include: { participants: true } } },
        });
        const placedLeaderIds = new Set<string>();
        const placedFollowerIds = new Set<string>();
        for (const heat of heats) {
          const participants = heat.draws[0]?.participants ?? [];
          const leaders = participants.filter((p) => p.role === "LEADER");
          const followers = participants.filter((p) => p.role === "FOLLOWER");
          if (leaders.length !== followers.length) {
            throw new ValidationFailedError(
              `Нельзя зафиксировать жеребьёвку: в заходе №${heat.number} не поровну ведущих (${leaders.length}) и ведомых (${followers.length}) — кому-то не хватит партнёра. Добавьте помощника или разбейте заход.`
            );
          }
          for (const p of leaders) if (p.scored) placedLeaderIds.add(p.registrationId);
          for (const p of followers) if (p.scored) placedFollowerIds.add(p.registrationId);
        }

        // Все реально зарегистрированные и прошедшие check-in (с учётом
        // фильтра по прошедшим предыдущий раунд, A9) обязаны попасть хоть в
        // какой-то заход раунда — иначе не хватило вместимости заходов, и
        // часть участников молча осталась бы за бортом.
        const [eligibleLeaderIds, eligibleFollowerIds] = await Promise.all([
          getRoundEligiblePool(tx, { divisionId: round.division.id, roundOrder: round.order, role: "LEADER" }),
          getRoundEligiblePool(tx, { divisionId: round.division.id, roundOrder: round.order, role: "FOLLOWER" }),
        ]);
        const missingCount =
          [...eligibleLeaderIds].filter((id) => !placedLeaderIds.has(id)).length +
          [...eligibleFollowerIds].filter((id) => !placedFollowerIds.has(id)).length;
        if (missingCount > 0) {
          throw new ValidationFailedError(
            `Нельзя зафиксировать жеребьёвку: ${missingCount} участник(ов), прошедших check-in, не попали ни в один заход этого раунда — не хватает вместимости заходов. Добавьте ещё заход или увеличьте вместимость.`
          );
        }
      }
      // Раунды дивизиона запускаются строго по очереди — нельзя начать
      // финал, не проведя отборочный (docs/00_DECISIONS.md, A8): более
      // ранний по order раунд обязан быть COMPLETED прежде, чем этот
      // сможет перейти в RUNNING. Распространено и на DRAWING (2026-09-04,
      // A13, по запросу пользователя): нельзя начать жеребьёвку следующего
      // раунда, пока предыдущий не завершён — иначе жеребьёвка легко
      // сформируется ДО того, как Advancement Engine определит, кто прошёл
      // (пул тогда пришлось бы тянуть из ещё не посчитанного раунда).
      if (to === "RUNNING" || to === "DRAWING") {
        const earlierUnfinished = await tx.round.findFirst({
          where: { divisionId: round.division.id, order: { lt: round.order }, status: { not: "COMPLETED" } },
          orderBy: { order: "asc" },
          include: { stage: { select: { name: true } } },
        });
        if (earlierUnfinished) {
          const stageName =
            earlierUnfinished.stage?.name ??
            (earlierUnfinished.type ? (ROUND_TYPE_LABELS[earlierUnfinished.type] ?? earlierUnfinished.type) : "раунда");
          const verb = to === "RUNNING" ? "запустить" : "начать жеребьёвку";
          throw new ValidationFailedError(
            `Нельзя ${verb} этот раунд: раунд «${stageName}» ещё не завершён (не в статусе "Готово") — раунды проводятся по очереди.`
          );
        }
      }
    },
    applyUpdate: async (tx, { to, expectedVersion }) => {
      const result = await tx.round.updateMany({
        where: { id: roundId, statusVersion: expectedVersion },
        data: { status: to, statusVersion: { increment: 1 }, ...opts?.extraData },
      });
      if (result.count > 0 && opts?.onApplied) {
        await opts.onApplied(tx, actor);
      }
      return {
        before: { status: round.status, statusVersion: expectedVersion },
        after: { status: to, statusVersion: expectedVersion + 1 },
        updatedCount: result.count,
      };
    },
  });
}

// Вызывается из heat-state.ts сразу после того, как заход перешёл в
// FINISHED (в той же транзакции) — по запросу пользователя (2026-09-04):
// когда все заходы раунда оттанцевали, статус меняется сам, кнопка
// "Завершить"/"Начать судейство" не нужна. RUNNING -> FINISHED -> SCORING
// одной транзакцией, с audit на каждый шаг (CLAUDE.md §9), актёром
// остаётся тот, кто завершил последний заход. Тихо ничего не делает, если
// раунд ещё не все заходы завершены — не ошибка, а "рано".
//
// RUNNING и PAUSED — оба валидны здесь. Раньше у раунда была своя отдельная
// кнопка "Пауза" (RoundStatusControls) — она приводила ровно к этому: заход
// эту паузу не проверял и завершался всё равно, а раунд молча оставался в
// PAUSED навсегда, без единого способа сдвинуться дальше через обычный UI
// (docs/00_DECISIONS.md, A17). Кнопку убрали (2026-09-04) — RoundStatus
// PAUSED теперь недостижим через обычный UI, но проверка на него здесь
// намеренно осталась: дешёвая страховка на случай прямой правки БД (как,
// собственно, и обнаружился исходный баг), ничего не стоит и не мешает.
export async function autoAdvanceRoundIfAllHeatsFinishedInTx(tx: PrismaTx, roundId: string, actor: Actor): Promise<void> {
  const round = await tx.round.findUniqueOrThrow({ where: { id: roundId }, include: { finalSession: { select: { id: true } } } });
  if (round.status !== "RUNNING" && round.status !== "PAUSED") return;

  const unfinished = await tx.heat.count({ where: { roundId, status: { not: "FINISHED" } } });
  if (unfinished > 0) return;

  const toFinished = await tx.round.updateMany({
    where: { id: roundId, statusVersion: round.statusVersion },
    data: { status: "FINISHED", statusVersion: { increment: 1 }, endedAt: new Date() },
  });
  if (toFinished.count === 0) return; // гонка — кто-то другой уже сделал этот переход
  await writeAudit(tx, {
    actor,
    action: "round.transition",
    entityType: "Round",
    entityId: roundId,
    before: { status: round.status },
    after: { status: "FINISHED" },
    reason: "Все заходы раунда завершены — переведено автоматически.",
  });

  await tx.round.updateMany({
    where: { id: roundId, statusVersion: round.statusVersion + 1 },
    data: { status: "SCORING", statusVersion: { increment: 1 } },
  });
  await writeAudit(tx, {
    actor,
    action: "round.transition",
    entityType: "Round",
    entityId: roundId,
    before: { status: "FINISHED" },
    after: { status: "SCORING" },
    reason: "Автоматический переход к подсчёту баллов.",
  });

  // Финал (Этап 9) считается отдельным ranking engine (final-advancement.ts —
  // сумма + лексикографический tie-break по критериям), если для этого
  // раунда явно начат финал новой системы (FinalSession существует); иначе —
  // обычный путь (advancement.ts), как и раньше, без изменений.
  if (round.finalSession) {
    await maybeCalculateFinalOnEntryInTx(tx, roundId, actor);
  } else {
    await maybeCalculateOnEntryInTx(tx, roundId, actor);
  }
}
