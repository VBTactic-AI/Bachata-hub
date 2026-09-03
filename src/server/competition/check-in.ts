import { prisma } from "@/lib/prisma";
import { requirePermission } from "../rbac/authorize";
import { writeAudit } from "../audit/audit";
import { ValidationFailedError } from "../errors";

// Bib-номер — следующий свободный по порядку в рамках соревнования
// (docs/00_DECISIONS.md, B4), выдаётся сервером при check-in, а не заранее.
export async function checkInRegistration(registrationId: string, opts?: { late?: boolean }) {
  const registration = await prisma.registration.findUniqueOrThrow({
    where: { id: registrationId },
    select: { id: true, competitionId: true, status: true },
  });
  const actor = await requirePermission("checkin:manage", registration.competitionId);

  if (registration.status !== "REGISTERED") {
    throw new ValidationFailedError("Участник не в статусе REGISTERED — check-in невозможен.");
  }

  return prisma.$transaction(async (tx) => {
    const existing = await tx.checkIn.findUnique({ where: { registrationId } });
    if (existing) throw new ValidationFailedError("Check-in для этого участника уже выполнен.");

    // Ретрай на случай гонки за один и тот же номер (03 §27) — на стойке
    // check-in обычно последовательный, но не полагаемся на это.
    let bibNumber: string | null = null;
    for (let attempt = 0; attempt < 5 && !bibNumber; attempt++) {
      const count = await tx.checkIn.count({ where: { competitionId: registration.competitionId } });
      const candidate = String(count + 1 + attempt);
      const clash = await tx.checkIn.findUnique({
        where: { competitionId_bibNumber: { competitionId: registration.competitionId, bibNumber: candidate } },
      });
      if (!clash) bibNumber = candidate;
    }
    if (!bibNumber) throw new ValidationFailedError("Не удалось выдать номер участника, попробуйте ещё раз.");

    const created = await tx.checkIn.create({
      data: {
        registrationId,
        competitionId: registration.competitionId,
        status: opts?.late ? "LATE" : "CHECKED_IN",
        bibNumber,
        checkedInById: actor.userId,
      },
    });

    await writeAudit(tx, {
      actor,
      action: "checkin.create",
      entityType: "CheckIn",
      entityId: created.id,
      after: { registrationId, bibNumber, status: created.status },
    });

    return created;
  });
}
