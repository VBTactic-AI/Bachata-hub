import type { Prisma, RoundStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { transition, type TransitionTable } from "./machine";
import { requirePermission } from "../rbac/authorize";
import type { Permission } from "../rbac/permissions";
import type { Actor } from "../rbac/actor";
import { ValidationFailedError } from "../errors";
import { ROUND_TYPE_LABELS } from "@/lib/competition-labels";

type PrismaTx = Prisma.TransactionClient;

// Без RESUMED — это переход (PAUSED -> RUNNING), а не отдельное состояние
// (docs/00_DECISIONS.md, A2).
const TABLE: TransitionTable<RoundStatus> = {
  DRAFT: ["READY"],
  READY: ["DRAWING"],
  DRAWING: ["DRAW_LOCKED"],
  DRAW_LOCKED: ["RUNNING"],
  RUNNING: ["PAUSED", "FINISHED"],
  PAUSED: ["RUNNING"],
  FINISHED: ["SCORING"],
  SCORING: ["COMPLETED"],
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
    case "PAUSED":
      return "round:pause";
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
            `Нельзя зафиксировать жеребьёвку: для заезда №${heatWithoutDraw.number} ещё не сформирован список вызванных.`
          );
        }
      }
      // Раунды дивизиона запускаются строго по очереди — нельзя начать
      // финал, не проведя отборочный (docs/00_DECISIONS.md, A8): более
      // ранний по order раунд обязан быть COMPLETED прежде, чем этот
      // сможет перейти в RUNNING.
      if (to === "RUNNING") {
        const earlierUnfinished = await tx.round.findFirst({
          where: { divisionId: round.division.id, order: { lt: round.order }, status: { not: "COMPLETED" } },
          orderBy: { order: "asc" },
          include: { stage: { select: { name: true } } },
        });
        if (earlierUnfinished) {
          const stageName =
            earlierUnfinished.stage?.name ??
            (earlierUnfinished.type ? (ROUND_TYPE_LABELS[earlierUnfinished.type] ?? earlierUnfinished.type) : "раунда");
          throw new ValidationFailedError(
            `Нельзя запустить этот раунд: раунд «${stageName}» ещё не завершён (не в статусе "Готово") — раунды проводятся по очереди.`
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
