import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "../rbac/authorize";
import { writeAudit } from "../audit/audit";
import type { AddDivisionInput } from "./schemas";

export async function addDivision(competitionId: string, input: AddDivisionInput): Promise<{ id: string }> {
  const actor = await requirePermission("competition:update", competitionId);

  const division = await prisma.$transaction(async (tx) => {
    const created = await tx.division.create({
      data: {
        competitionId,
        name: input.name,
        level: input.level,
        minAge: input.minAge,
        maxAge: input.maxAge,
        maxParticipants: input.maxParticipants,
        rules: (input.rules ?? {}) as Prisma.InputJsonValue,
      },
    });

    await writeAudit(tx, {
      actor,
      action: "division.create",
      entityType: "Division",
      entityId: created.id,
      after: { competitionId, name: created.name, level: created.level },
    });

    return created;
  });

  return { id: division.id };
}
