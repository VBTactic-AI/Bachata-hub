import { prisma } from "@/lib/prisma";
import { requirePermission } from "../rbac/authorize";
import { writeAudit } from "../audit/audit";
import { ValidationFailedError } from "../errors";
import { getOrCreateLatestRulesVersion } from "./rules-version";
import type { CreateRoundInput } from "./schemas";

// Раунд ссылается на этап из общего справочника (RoundStageCatalog), а не
// на свободный текст/enum (docs/00_DECISIONS.md, A7) — название организатор
// не придумывает, только выбирает и, при необходимости, правит число
// "сколько проходит дальше" под размер своего дивизиона.
export async function createRound(divisionId: string, input: CreateRoundInput): Promise<{ id: string }> {
  const division = await prisma.division.findUniqueOrThrow({
    where: { id: divisionId },
    select: { competitionId: true },
  });
  const actor = await requirePermission("round:create", division.competitionId);

  const stage = await prisma.roundStageCatalog.findUnique({ where: { id: input.stageId } });
  if (!stage || !stage.isActive) {
    throw new ValidationFailedError("Выбранный этап отбора недоступен.");
  }

  const round = await prisma.$transaction(async (tx) => {
    const rules = await getOrCreateLatestRulesVersion(tx, division.competitionId, actor);

    const last = await tx.round.findFirst({ where: { divisionId }, orderBy: { order: "desc" } });
    const order = (last?.order ?? 0) + 1;

    const created = await tx.round.create({
      data: {
        divisionId,
        stageId: input.stageId,
        order,
        finalistsCount: input.finalistsCount,
        heatCapacity: input.heatCapacity,
        rulesId: rules.id,
      },
    });

    await writeAudit(tx, {
      actor,
      action: "round.create",
      entityType: "Round",
      entityId: created.id,
      after: {
        divisionId,
        stageId: input.stageId,
        stageName: stage.name,
        order,
        finalistsCount: input.finalistsCount,
        rulesId: rules.id,
      },
    });

    return created;
  });

  return { id: round.id };
}
