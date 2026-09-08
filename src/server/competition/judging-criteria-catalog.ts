import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "../rbac/authorize";
import { writeAudit } from "../audit/audit";
import { ValidationFailedError } from "../errors";
import type { CreateJudgingCriterionCatalogInput, UpdateJudgingCriterionCatalogInput } from "./schemas";

// Глобальный справочник, не привязан к конкретному соревнованию —
// judging_criteria:manage проверяется без competitionId (как
// division_category:manage/round_stage:manage).
export async function createJudgingCriterionCatalog(input: CreateJudgingCriterionCatalogInput): Promise<{ id: string }> {
  const actor = await requirePermission("judging_criteria:manage");

  const last = await prisma.judgingCriterionCatalog.findFirst({ orderBy: { order: "desc" } });
  const order = (last?.order ?? 0) + 1;

  let created;
  try {
    created = await prisma.$transaction(async (tx) => {
      const criterion = await tx.judgingCriterionCatalog.create({
        data: { name: input.name, minScore: input.minScore, maxScore: input.maxScore, step: input.step, order },
      });
      await writeAudit(tx, {
        actor,
        action: "judging_criterion_catalog.create",
        entityType: "JudgingCriterionCatalog",
        entityId: criterion.id,
        after: { name: criterion.name, minScore: criterion.minScore, maxScore: criterion.maxScore, step: criterion.step, order: criterion.order },
      });
      return criterion;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new ValidationFailedError("Критерий с таким названием уже существует.");
    }
    throw e;
  }

  return { id: created.id };
}

// Правка существующего критерия справочника — название/диапазон/порядок/
// видимость. Не затрагивает уже созданные FinalCriterion (та копия
// значений на дивизионе не пересчитывается задним числом, CLAUDE.md §50-51).
export async function updateJudgingCriterionCatalog(id: string, input: UpdateJudgingCriterionCatalogInput): Promise<void> {
  const actor = await requirePermission("judging_criteria:manage");

  try {
    await prisma.$transaction(async (tx) => {
      const before = await tx.judgingCriterionCatalog.findUniqueOrThrow({ where: { id } });
      const after = await tx.judgingCriterionCatalog.update({
        where: { id },
        data: {
          name: input.name,
          minScore: input.minScore,
          maxScore: input.maxScore,
          step: input.step,
          order: input.order,
          isActive: input.isActive,
        },
      });

      await writeAudit(tx, {
        actor,
        action: "judging_criterion_catalog.update",
        entityType: "JudgingCriterionCatalog",
        entityId: id,
        before: { name: before.name, minScore: before.minScore, maxScore: before.maxScore, step: before.step, order: before.order, isActive: before.isActive },
        after: { name: after.name, minScore: after.minScore, maxScore: after.maxScore, step: after.step, order: after.order, isActive: after.isActive },
      });
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new ValidationFailedError("Критерий с таким названием уже существует.");
    }
    throw e;
  }
}
