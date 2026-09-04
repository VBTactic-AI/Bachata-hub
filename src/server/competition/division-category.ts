import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "../rbac/authorize";
import { writeAudit } from "../audit/audit";
import { ValidationFailedError } from "../errors";
import type { CreateDivisionCategoryInput, UpdateDivisionCategoryInput } from "./schemas";

// Глобальный справочник, не привязан к конкретному соревнованию —
// division_category:manage проверяется без competitionId (как
// competition:create).
export async function createDivisionCategory(input: CreateDivisionCategoryInput): Promise<{ id: string }> {
  const actor = await requirePermission("division_category:manage");

  const last = await prisma.divisionCategory.findFirst({ orderBy: { order: "desc" } });
  const order = (last?.order ?? 0) + 1;

  let created;
  try {
    created = await prisma.$transaction(async (tx) => {
      const category = await tx.divisionCategory.create({ data: { name: input.name, order } });
      await writeAudit(tx, {
        actor,
        action: "division_category.create",
        entityType: "DivisionCategory",
        entityId: category.id,
        after: { name: category.name, order: category.order },
      });
      return category;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new ValidationFailedError("Категория с таким названием уже существует.");
    }
    throw e;
  }

  return { id: created.id };
}

// Правка существующей категории — название и/или порядок можно поменять и
// после создания (2026-09-04, по запросу пользователя — раньше порядок
// вообще нельзя было поменять после создания). Порядок используется в
// каскаде авто-добора помощников (A10: "категория СТРОГО выше по order") —
// смена порядка меняет, кто кому в будущем "выше"/"ниже", но не трогает уже
// сформированные заходы/жеребьёвки (там уже сохранены конкретные
// registrationId, не пересчитываются задним числом, CLAUDE.md §51).
export async function updateDivisionCategory(categoryId: string, input: UpdateDivisionCategoryInput): Promise<void> {
  const actor = await requirePermission("division_category:manage");

  try {
    await prisma.$transaction(async (tx) => {
      const before = await tx.divisionCategory.findUniqueOrThrow({ where: { id: categoryId } });
      const after = await tx.divisionCategory.update({
        where: { id: categoryId },
        data: { name: input.name, order: input.order, isActive: input.isActive },
      });

      await writeAudit(tx, {
        actor,
        action: "division_category.update",
        entityType: "DivisionCategory",
        entityId: categoryId,
        before: { name: before.name, order: before.order, isActive: before.isActive },
        after: { name: after.name, order: after.order, isActive: after.isActive },
      });
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new ValidationFailedError("Категория с таким названием уже существует.");
    }
    throw e;
  }
}

// Не физическое удаление (CLAUDE.md §18) — деактивированная категория
// пропадает из списка выбора для НОВЫХ дивизионов, но остаётся у всех уже
// созданных Division/Registration без изменений.
export async function setDivisionCategoryActive(categoryId: string, isActive: boolean): Promise<void> {
  const actor = await requirePermission("division_category:manage");

  await prisma.$transaction(async (tx) => {
    const before = await tx.divisionCategory.findUniqueOrThrow({ where: { id: categoryId } });
    const after = await tx.divisionCategory.update({ where: { id: categoryId }, data: { isActive } });

    await writeAudit(tx, {
      actor,
      action: "division_category.set_active",
      entityType: "DivisionCategory",
      entityId: categoryId,
      before: { isActive: before.isActive },
      after: { isActive: after.isActive },
    });
  });
}
