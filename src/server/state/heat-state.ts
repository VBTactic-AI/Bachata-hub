import type { HeatStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { transition, type TransitionTable } from "./machine";
import { requirePermission } from "../rbac/authorize";
import type { Permission } from "../rbac/permissions";

const TABLE: TransitionTable<HeatStatus> = {
  PENDING: ["RUNNING"],
  RUNNING: ["PAUSED", "FINISHED"],
  PAUSED: ["RUNNING"],
  FINISHED: [],
};

function permissionFor(to: HeatStatus): Permission {
  return to === "PAUSED" ? "round:pause" : to === "FINISHED" ? "round:end" : "round:start";
}

// Идемпотентность START_HEAT (CLAUDE.md §11): повторный вызов на уже
// RUNNING heat не запускает его дважды — таблица переходов просто не
// разрешает PENDING/RUNNING -> RUNNING как "переход" сама по себе, а
// оптимистичная блокировка в machine.transition() ловит гонку двух
// одновременных попыток запуска (03 §27).
export async function transitionHeat(heatId: string, to: HeatStatus, opts?: { reason?: string }): Promise<void> {
  const heat = await prisma.heat.findUniqueOrThrow({
    where: { id: heatId },
    include: { round: { include: { division: { select: { competitionId: true } } } } },
  });
  const competitionId = heat.round.division.competitionId;
  const actor = await requirePermission(permissionFor(to), competitionId);

  await transition({
    entityType: "Heat",
    entityId: heatId,
    table: TABLE,
    currentStatus: heat.status,
    statusVersion: heat.statusVersion,
    to,
    actor,
    reason: opts?.reason,
    applyUpdate: async (tx, { to, expectedVersion }) => {
      const result = await tx.heat.updateMany({
        where: { id: heatId, statusVersion: expectedVersion },
        data: { status: to, statusVersion: { increment: 1 } },
      });
      return {
        before: { status: heat.status, statusVersion: expectedVersion },
        after: { status: to, statusVersion: expectedVersion + 1 },
        updatedCount: result.count,
      };
    },
  });
}
