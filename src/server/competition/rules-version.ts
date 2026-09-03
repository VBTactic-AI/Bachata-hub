import { Prisma } from "@prisma/client";
import type { Actor } from "../rbac/actor";
import { writeAudit } from "../audit/audit";

type PrismaTx = Prisma.TransactionClient;

// Round.rulesId обязателен (02 §4), а отдельного шага "настроить правила"
// перед раундами пока нет. Решение (docs/00_DECISIONS.md, A3): переиспользуем
// последнюю версию CompetitionRules соревнования, а если её ещё нет —
// заводим версию 1 с пустыми {} тем же аудитом, что и ручной setCompetitionRules
// (не молчаливое действие, CLAUDE.md §60). Общий хелпер — используется и при
// ручном создании раунда, и при авто-генерации.
export async function getOrCreateLatestRulesVersion(
  tx: PrismaTx,
  competitionId: string,
  actor: Actor
): Promise<{ id: string }> {
  let rules = await tx.competitionRules.findFirst({
    where: { competitionId },
    orderBy: { version: "desc" },
  });
  if (!rules) {
    rules = await tx.competitionRules.create({
      data: { competitionId, version: 1, rules: {} as Prisma.InputJsonValue },
    });
    await writeAudit(tx, {
      actor,
      action: "competition_rules.create",
      entityType: "CompetitionRules",
      entityId: rules.id,
      after: { competitionId, version: 1, auto: true },
      reason: "Автоматически создано при первом раунде — правила ещё не настроены явно.",
    });
  }
  return rules;
}
