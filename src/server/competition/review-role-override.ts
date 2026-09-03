import { prisma } from "@/lib/prisma";
import { requirePermission } from "../rbac/authorize";
import { writeAudit } from "../audit/audit";
import { ValidationFailedError } from "../errors";

// APPROVE — роль участника становится такой, как он попросил (requestedRole).
// REJECT — роль остаётся подсказкой по полу, которая уже стоит как
// действующая (docs/00_DECISIONS.md) — данные при этом не удаляются, решение
// остаётся в audit log.
export async function reviewRoleOverride(
  registrationId: string,
  decision: "APPROVE" | "REJECT",
  opts?: { reason?: string }
) {
  const registration = await prisma.registration.findUniqueOrThrow({
    where: { id: registrationId },
    select: { id: true, competitionId: true, role: true, requestedRole: true, roleOverrideStatus: true },
  });
  const actor = await requirePermission("registration:role_override_review", registration.competitionId);

  if (registration.roleOverrideStatus !== "PENDING") {
    throw new ValidationFailedError("Запрос на смену роли уже рассмотрен или отсутствует.");
  }

  return prisma.$transaction(async (tx) => {
    const newRole = decision === "APPROVE" ? registration.requestedRole! : registration.role;

    const updated = await tx.registration.update({
      where: { id: registrationId },
      data: {
        role: newRole,
        roleOverrideStatus: decision === "APPROVE" ? "APPROVED" : "REJECTED",
        roleOverrideReviewedById: actor.userId,
        roleOverrideReviewedAt: new Date(),
      },
    });

    await writeAudit(tx, {
      actor,
      action: "registration.role_override_review",
      entityType: "Registration",
      entityId: registrationId,
      before: { role: registration.role, roleOverrideStatus: "PENDING" },
      after: { role: updated.role, roleOverrideStatus: updated.roleOverrideStatus },
      reason: opts?.reason,
    });

    return updated;
  });
}
