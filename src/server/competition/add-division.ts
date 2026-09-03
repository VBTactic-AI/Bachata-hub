import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "../rbac/authorize";
import { writeAudit } from "../audit/audit";
import { ValidationFailedError } from "../errors";
import type { AddDivisionInput } from "./schemas";

export async function addDivision(competitionId: string, input: AddDivisionInput): Promise<{ id: string }> {
  const actor = await requirePermission("competition:update", competitionId);

  // Категория обязана существовать и быть активной — сама форма отдаёт на
  // выбор только активные, но проверяем и на сервере (CLAUDE.md §44:
  // валидация нужна и на бэкенде), на случай прямого вызова API.
  const category = await prisma.divisionCategory.findUnique({ where: { id: input.categoryId } });
  if (!category || !category.isActive) {
    throw new ValidationFailedError("Выбранная категория недоступна.");
  }

  const division = await prisma.$transaction(async (tx) => {
    const created = await tx.division.create({
      data: {
        competitionId,
        categoryId: input.categoryId,
        minAge: input.minAge,
        maxAge: input.maxAge,
        maxParticipants: input.maxParticipants,
        heatCapacity: input.heatCapacity,
        rules: (input.rules ?? {}) as Prisma.InputJsonValue,
      },
    });

    await writeAudit(tx, {
      actor,
      action: "division.create",
      entityType: "Division",
      entityId: created.id,
      after: { competitionId, categoryId: created.categoryId, categoryName: category.name },
    });

    return created;
  });

  return { id: division.id };
}
