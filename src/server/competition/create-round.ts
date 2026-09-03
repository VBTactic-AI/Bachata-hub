import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "../rbac/authorize";
import { writeAudit } from "../audit/audit";
import type { CreateRoundInput } from "./schemas";

// Round.rulesId обязателен (02 §4), а отдельного шага "настроить правила"
// перед раундами пока нет. Решение (docs/00_DECISIONS.md, A3): при создании
// раунда переиспользуем последнюю версию CompetitionRules соревнования, а
// если её ещё нет — заводим версию 1 с пустыми {} тем же аудитом, что и
// ручной setCompetitionRules (не молчаливое действие, CLAUDE.md §60).
export async function createRound(divisionId: string, input: CreateRoundInput): Promise<{ id: string }> {
  const division = await prisma.division.findUniqueOrThrow({
    where: { id: divisionId },
    select: { competitionId: true },
  });
  const actor = await requirePermission("round:create", division.competitionId);

  const round = await prisma.$transaction(async (tx) => {
    let rules = await tx.competitionRules.findFirst({
      where: { competitionId: division.competitionId },
      orderBy: { version: "desc" },
    });
    if (!rules) {
      rules = await tx.competitionRules.create({
        data: { competitionId: division.competitionId, version: 1, rules: {} as Prisma.InputJsonValue },
      });
      await writeAudit(tx, {
        actor,
        action: "competition_rules.create",
        entityType: "CompetitionRules",
        entityId: rules.id,
        after: { competitionId: division.competitionId, version: 1, auto: true },
        reason: "Автоматически создано при первом раунде — правила ещё не настроены явно.",
      });
    }

    const last = await tx.round.findFirst({ where: { divisionId }, orderBy: { order: "desc" } });
    const order = (last?.order ?? 0) + 1;

    const created = await tx.round.create({
      data: {
        divisionId,
        name: input.name,
        type: input.type,
        order,
        finalistsCount: input.finalistsCount,
        rulesId: rules.id,
      },
    });

    await writeAudit(tx, {
      actor,
      action: "round.create",
      entityType: "Round",
      entityId: created.id,
      after: { divisionId, name: created.name, type: created.type, order, rulesId: rules.id },
    });

    return created;
  });

  return { id: round.id };
}
