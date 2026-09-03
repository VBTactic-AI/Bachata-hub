import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "../rbac/authorize";
import { writeAudit } from "../audit/audit";

// Каждый вызов создаёт НОВУЮ версию правил, не перезаписывает старую
// (docs/00_DECISIONS.md, A1) — раунды, созданные под старой версией,
// продолжают на неё ссылаться и не пересчитываются задним числом
// (CLAUDE.md §51).
export async function setCompetitionRules(
  competitionId: string,
  rules: Record<string, unknown>
): Promise<{ id: string; version: number }> {
  const actor = await requirePermission("competition:settings_update", competitionId);

  const result = await prisma.$transaction(async (tx) => {
    const last = await tx.competitionRules.findFirst({
      where: { competitionId },
      orderBy: { version: "desc" },
    });
    const version = (last?.version ?? 0) + 1;

    const created = await tx.competitionRules.create({
      data: { competitionId, version, rules: rules as Prisma.InputJsonValue },
    });

    await writeAudit(tx, {
      actor,
      action: "competition_rules.create",
      entityType: "CompetitionRules",
      entityId: created.id,
      after: { competitionId, version },
    });

    return created;
  });

  return { id: result.id, version: result.version };
}
