import { prisma } from "@/lib/prisma";
import { requirePermission } from "../rbac/authorize";
import { writeAudit } from "../audit/audit";
import { ValidationFailedError } from "../errors";
import { isFinalStageInTx } from "../judging/advancement";

// Публикация списка "кто прошёл дальше" ОДНОГО раунда — независимо от
// публикации официальных мест всего соревнования (Result,
// src/server/results/results.ts). Уточнено пользователем (2026-09-04):
// организатор может показать промежуточный список сразу после раунда, не
// дожидаясь конца всего конкурса. Не применяется к финальному раунду
// дивизиона и к служебным TIE_BREAK — финальные места публикуются только
// вместе со всем соревнованием (publishCompetitionResults), а решение
// перетанцовки уже отражено в RoundResult родительского раунда.
export async function publishRoundAdvancement(roundId: string): Promise<void> {
  const round = await prisma.round.findUniqueOrThrow({
    where: { id: roundId },
    include: { division: { select: { id: true, competitionId: true } } },
  });
  const actor = await requirePermission("result:publish", round.division.competitionId);

  if (round.type === "TIE_BREAK") {
    throw new ValidationFailedError("У перетанцовки нет отдельной публикации — решение уже отражено в списке родительского раунда.");
  }
  if (round.status !== "COMPLETED") {
    throw new ValidationFailedError('Публиковать список прошедших можно только после завершения раунда (статус "Завершён").');
  }
  const isFinal = await isFinalStageInTx(prisma, round.division.id, round.order);
  if (isFinal) {
    throw new ValidationFailedError("Это финальный раунд — места публикуются через публикацию результатов всего соревнования, не здесь.");
  }
  if (round.advancementPublishedAt) return; // уже опубликован — идемпотентно

  await prisma.$transaction(async (tx) => {
    await tx.round.update({
      where: { id: roundId },
      data: { advancementPublishedAt: new Date(), advancementPublishedById: actor.userId },
    });
    await writeAudit(tx, { actor, action: "round.advancement_publish", entityType: "Round", entityId: roundId });
  });
}

export async function unpublishRoundAdvancement(roundId: string, reason: string): Promise<void> {
  const round = await prisma.round.findUniqueOrThrow({
    where: { id: roundId },
    include: { division: { select: { competitionId: true } } },
  });
  const actor = await requirePermission("result:unpublish", round.division.competitionId);
  if (!reason.trim()) {
    throw new ValidationFailedError("Нужно указать причину отмены публикации.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.round.update({
      where: { id: roundId },
      data: { advancementPublishedAt: null, advancementPublishedById: null },
    });
    await writeAudit(tx, { actor, action: "round.advancement_unpublish", entityType: "Round", entityId: roundId, reason });
  });
}
