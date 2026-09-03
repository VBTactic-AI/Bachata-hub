import type { RoundStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { transition, type TransitionTable } from "./machine";
import { requirePermission } from "../rbac/authorize";
import type { Permission } from "../rbac/permissions";
import { ValidationFailedError } from "../errors";
import { ROUND_TYPE_LABELS } from "@/lib/competition-labels";

// Без RESUMED — это переход (PAUSED -> RUNNING), а не отдельное состояние
// (docs/00_DECISIONS.md, A2).
const TABLE: TransitionTable<RoundStatus> = {
  DRAFT: ["READY"],
  READY: ["DRAWING"],
  // DRAWING/DRAW_LOCKED требуют Draw Engine (появится на фазе 5) — переход
  // формально описан в таблице, но явно отклоняется guard-ом ниже, а не
  // тихо оставляет раунд в состоянии, которое ничего не умеет обрабатывать.
  DRAWING: ["DRAW_LOCKED"],
  DRAW_LOCKED: ["RUNNING"],
  RUNNING: ["PAUSED", "FINISHED"],
  PAUSED: ["RUNNING"],
  FINISHED: ["SCORING"],
  SCORING: ["COMPLETED"],
  COMPLETED: [],
};

const REQUIRES_DRAW_ENGINE: readonly RoundStatus[] = ["DRAWING", "DRAW_LOCKED"];

// Огрубление на этапе фундамента: точные права на "начать scoring"/
// "завершить scoring" появятся вместе со сервисом судейства. Пока — по
// ближайшему по смыслу праву из 03 §4.
function permissionFor(to: RoundStatus): Permission {
  switch (to) {
    case "READY":
      return "round:create";
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
  opts?: { reason?: string }
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
      if (REQUIRES_DRAW_ENGINE.includes(to)) {
        // ValidationFailedError — не обычный Error: respondToDomainError()
        // отдаёт понятное сообщение (CLAUDE.md §46) вместо generic 500
        // "Внутренняя ошибка сервера", в который сваливается голый Error.
        throw new ValidationFailedError(
          `Переход раунда в статус "${to}" требует Draw Engine — он появится на следующем этапе разработки.`
        );
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
          const stageName = earlierUnfinished.stage?.name ?? (earlierUnfinished.type ? (ROUND_TYPE_LABELS[earlierUnfinished.type] ?? earlierUnfinished.type) : "раунда");
          throw new ValidationFailedError(
            `Нельзя запустить этот раунд: раунд «${stageName}» ещё не завершён (не в статусе "Готово") — раунды проводятся по очереди.`
          );
        }
      }
    },
    applyUpdate: async (tx, { to, expectedVersion }) => {
      const result = await tx.round.updateMany({
        where: { id: roundId, statusVersion: expectedVersion },
        data: { status: to, statusVersion: { increment: 1 } },
      });
      return {
        before: { status: round.status, statusVersion: expectedVersion },
        after: { status: to, statusVersion: expectedVersion + 1 },
        updatedCount: result.count,
      };
    },
  });
}
