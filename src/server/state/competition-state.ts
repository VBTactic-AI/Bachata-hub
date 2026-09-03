import type { CompetitionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { transition, type TransitionTable } from "./machine";
import { requirePermission } from "../rbac/authorize";
import type { Permission } from "../rbac/permissions";

// CLAUDE.md §9. Публикация — отдельное, более чувствительное право
// (competition:publish), чем остальные переходы (competition:update, 03 §4).
const TABLE: TransitionTable<CompetitionStatus> = {
  DRAFT: ["REGISTRATION_OPEN"],
  REGISTRATION_OPEN: ["REGISTRATION_CLOSED"],
  REGISTRATION_CLOSED: ["CHECK_IN"],
  CHECK_IN: ["READY"],
  READY: ["LIVE"],
  LIVE: ["SCORING"],
  SCORING: ["REVIEW"],
  REVIEW: ["PUBLISHED"],
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
