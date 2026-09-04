import type { CompetitionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { transition, type TransitionTable } from "./machine";
import { requirePermission } from "../rbac/authorize";
import type { Permission } from "../rbac/permissions";

// CLAUDE.md §9. Публикация — отдельное, более чувствительное право
// (competition:publish), чем остальные переходы (competition:update, 03 §4).
//
// REVIEW -> PUBLISHED убран из этой таблицы (Этап 10, docs/00_DECISIONS.md):
// голый флип статуса не проверял вообще ничего (все обязательные оценки
// собраны, все дивизионы досчитаны, ничьи разрешены — CLAUDE.md §36) и не
// включал реальную публичную видимость (Competition.publicResults) — те же
// причины, по которым A9 убрал прямой переход в DRAWING/FINISHED/SCORING/
// COMPLETED у Round (CLAUDE.md §45: нельзя обходить бизнес-операцию голым
// PATCH статуса). Публикация теперь — только через
// publishCompetitionResults()/unpublishCompetitionResults()
// (src/server/results/results.ts), которые проверяют готовность каждого
// дивизиона и явно включают/выключают publicResults.
const TABLE: TransitionTable<CompetitionStatus> = {
  DRAFT: ["REGISTRATION_OPEN"],
  REGISTRATION_OPEN: ["REGISTRATION_CLOSED"],
  REGISTRATION_CLOSED: ["CHECK_IN"],
  CHECK_IN: ["READY"],
  READY: ["LIVE"],
  LIVE: ["SCORING"],
  SCORING: ["REVIEW"],
  REVIEW: [],
  PUBLISHED: ["ARCHIVED"],
  ARCHIVED: [],
};

function permissionFor(to: CompetitionStatus): Permission {
  return to === "PUBLISHED" ? "competition:publish" : "competition:update";
}

export async function transitionCompetition(
  competitionId: string,
  to: CompetitionStatus,
  opts?: { reason?: string }
): Promise<void> {
  const competition = await prisma.competition.findUniqueOrThrow({ where: { id: competitionId } });
  const actor = await requirePermission(permissionFor(to), competitionId);

  await transition({
    entityType: "Competition",
    entityId: competitionId,
    table: TABLE,
    currentStatus: competition.status,
    statusVersion: competition.statusVersion,
    to,
    actor,
    reason: opts?.reason,
    applyUpdate: async (tx, { to, expectedVersion }) => {
      const result = await tx.competition.updateMany({
        where: { id: competitionId, statusVersion: expectedVersion },
        data: { status: to, statusVersion: { increment: 1 } },
      });
      return {
        before: { status: competition.status, statusVersion: expectedVersion },
        after: { status: to, statusVersion: expectedVersion + 1 },
        updatedCount: result.count,
      };
    },
  });
}
