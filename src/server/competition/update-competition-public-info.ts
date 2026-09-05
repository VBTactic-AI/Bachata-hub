import { prisma } from "@/lib/prisma";
import { requirePermission } from "../rbac/authorize";
import { writeAudit } from "../audit/audit";
import type { UpdateCompetitionPublicInfoInput } from "./schemas";

// Публичная информация (Этап 12) — чисто справочные поля для зрителей
// (правила текстом или ссылкой, ссылка на фотоальбом), ни на что в движке
// не влияют. Пустая строка сохраняется как null (явная очистка) — форма
// всегда отправляет все три поля разом.
export async function updateCompetitionPublicInfo(
  competitionId: string,
  input: UpdateCompetitionPublicInfoInput
): Promise<void> {
  const competition = await prisma.competition.findUniqueOrThrow({
    where: { id: competitionId },
    select: { rulesText: true, rulesUrl: true, mediaUrl: true },
  });
  const actor = await requirePermission("competition:settings_update", competitionId);

  const next = {
    rulesText: input.rulesText || null,
    rulesUrl: input.rulesUrl || null,
    mediaUrl: input.mediaUrl || null,
  };

  await prisma.$transaction(async (tx) => {
    await tx.competition.update({ where: { id: competitionId }, data: next });
    await writeAudit(tx, {
      actor,
      action: "competition.update_public_info",
      entityType: "Competition",
      entityId: competitionId,
      before: competition,
      after: next,
    });
  });
}
