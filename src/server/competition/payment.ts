import { prisma } from "@/lib/prisma";
import { requirePermission } from "../rbac/authorize";
import { writeAudit } from "../audit/audit";

// Оплата (redesign вкладки "Участники", 2026-09-09) — только факт
// оплачено/не оплачено, без сумм/валюты/интеграции с платёжной системой (по
// решению пользователя, расширится отдельной задачей позже). Переключает
// вручную тот же, кто и так управляет регистрациями (registration:manage) —
// то же право, что уже использует ручная регистрация участника.
export async function setRegistrationPayment(registrationId: string, isPaid: boolean): Promise<void> {
  const registration = await prisma.registration.findUniqueOrThrow({
    where: { id: registrationId },
    select: { id: true, competitionId: true, isPaid: true, paidAt: true },
  });
  const actor = await requirePermission("registration:manage", registration.competitionId);

  await prisma.$transaction(async (tx) => {
    const paidAt = isPaid ? new Date() : null;
    const after = await tx.registration.update({
      where: { id: registrationId },
      data: { isPaid, paidAt },
    });

    await writeAudit(tx, {
      actor,
      action: "registration.set_payment",
      entityType: "Registration",
      entityId: registrationId,
      before: { isPaid: registration.isPaid, paidAt: registration.paidAt },
      after: { isPaid: after.isPaid, paidAt: after.paidAt },
    });
  });
}
