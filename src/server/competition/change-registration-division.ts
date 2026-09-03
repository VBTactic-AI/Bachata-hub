import { prisma } from "@/lib/prisma";
import { requirePermission } from "../rbac/authorize";
import { writeAudit } from "../audit/audit";
import { AlreadyRegisteredError, ValidationFailedError } from "../errors";
import { Prisma } from "@prisma/client";

// Категория ("уровень") не ограничивает регистрацию — но организатор может
// перенести уже зарегистрированного участника в другой дивизион ЭТОГО ЖЕ
// соревнования (напр. заявился как "Любители", по факту оказался "Профи").
// Явное действие + audit — не тихая правка поля (CLAUDE.md §29/§31).
export async function changeRegistrationDivision(
  registrationId: string,
  newDivisionId: string,
  opts?: { reason?: string }
): Promise<void> {
  const registration = await prisma.registration.findUniqueOrThrow({
    where: { id: registrationId },
    select: { id: true, competitionId: true, divisionId: true },
  });
  const actor = await requirePermission("registration:change_division", registration.competitionId);

  const newDivision = await prisma.division.findFirst({
    where: { id: newDivisionId, competitionId: registration.competitionId },
  });
  if (!newDivision) {
    throw new ValidationFailedError("Дивизион не найден в этом соревновании.");
  }
  if (newDivision.id === registration.divisionId) return; // уже там — ничего делать не нужно

  try {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.registration.update({
        where: { id: registrationId },
        data: { divisionId: newDivisionId },
      });

      await writeAudit(tx, {
        actor,
        action: "registration.change_division",
        entityType: "Registration",
        entityId: registrationId,
        before: { divisionId: registration.divisionId },
        after: { divisionId: updated.divisionId },
        reason: opts?.reason,
      });
    });
  } catch (e) {
    // Уникальный индекс (competitionId, divisionId, dancerId) — участник уже
    // зарегистрирован в целевом дивизионе под другой записью.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new AlreadyRegisteredError();
    }
    throw e;
  }
}
