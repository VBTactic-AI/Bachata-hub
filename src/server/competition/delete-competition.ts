import { prisma } from "@/lib/prisma";
import { requirePermission } from "../rbac/authorize";
import { writeAudit } from "../audit/audit";
import { ValidationFailedError } from "../errors";
import type { DeleteCompetitionInput } from "./schemas";

// Физическое удаление всего соревнования — только SUPER_ADMIN
// (competition:delete проверяется БЕЗ competitionId, как competition:create,
// см. authorize.ts: право есть только глобально в сиде, EVENT_ADMIN его не
// получает). По прямому запросу пользователя (2026-09-09).
//
// Блокируется для PUBLISHED/ARCHIVED (CLAUDE.md §18/§63 — после публикации
// результат зафиксирован и история должна сохраняться; альтернатива —
// transitionCompetition() в ARCHIVED, а не удаление). До публикации
// соревнование можно удалить целиком, даже если в нём уже есть регистрации/
// раунды/оценки — это тот же принцип, что deleteDivisionCategory() уже
// применяет к справочникам (блокировать только когда данные СТАЛИ реальной
// историей, не превентивно).
//
// AuditLog/CompetitionEvent НЕ связаны с Competition внешним ключом
// (schema.prisma — entityId у AuditLog хранится как обычная строка, без
// @relation) — каскадное удаление сносит только "живые" таблицы
// (Registration/CheckIn/Division/Round/Heat/Draw/JudgeScore/...), но не
// трогает уже записанный аудит: он переживает удаление самого соревнования,
// как и должен (§28).
export async function deleteCompetition(competitionId: string, input: DeleteCompetitionInput): Promise<void> {
  const actor = await requirePermission("competition:delete");

  const competition = await prisma.competition.findUniqueOrThrow({
    where: { id: competitionId },
    include: { _count: { select: { registrations: true, divisions: true, members: true } } },
  });

  if (competition.status === "PUBLISHED" || competition.status === "ARCHIVED") {
    throw new ValidationFailedError(
      "Нельзя удалить соревнование с опубликованными результатами — история должна сохраняться. Переведите его в архив вместо удаления."
    );
  }

  await prisma.$transaction(async (tx) => {
    await writeAudit(tx, {
      actor,
      action: "competition.delete",
      entityType: "Competition",
      entityId: competitionId,
      before: {
        name: competition.name,
        slug: competition.slug,
        status: competition.status,
        divisions: competition._count.divisions,
        registrations: competition._count.registrations,
        members: competition._count.members,
      },
      reason: input.reason,
    });
    await tx.competition.delete({ where: { id: competitionId } });
  });
}
