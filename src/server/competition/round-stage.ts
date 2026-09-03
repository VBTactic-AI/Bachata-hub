import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "../rbac/authorize";
import { writeAudit } from "../audit/audit";
import { ValidationFailedError } from "../errors";
import type { CreateRoundStageInput, UpdateRoundStageInput } from "./schemas";

// Глобальный справочник, не привязан к конкретному соревнованию —
// round_stage:manage проверяется без competitionId (как division_category:manage).
export async function createRoundStage(input: CreateRoundStageInput): Promise<{ id: string }> {
  const actor = await requirePermission("round_stage:manage");

  const last = await prisma.roundStageCatalog.findFirst({ orderBy: { order: "desc" } });
  const order = (last?.order ?? 0) + 1;

  let created;
  try {
    created = await prisma.$transaction(async (tx) => {
      const stage = await tx.roundStageCatalog.create({
        data: { name: input.name, order, defaultAdvanceCount: input.defaultAdvanceCount },
      });
      await writeAudit(tx, {
        actor,
        action: "round_stage.create",
        entityType: "RoundStageCatalog",
        entityId: stage.id,
        after: { name: stage.name, order: stage.order, defaultAdvanceCount: stage.defaultAdvanceCount },
      });
      return stage;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new ValidationFailedError("Этап с таким названием уже существует.");
    }
    throw e;
  }

  return { id: created.id };
}

// Правка существующего этапа — название и/или число "проходит дальше" по
// умолчанию можно поменять и после создания (не только скрыть/показать).
// Безопасно для истории: конкретное число, с которым был создан раунд,
// хранится в самом Round.finalistsCount (не пересчитывается), а название
// раунда в UI действительно возьмётся новое — это просто правка ярлыка
// справочника, а не изменение результата соревнования (CLAUDE.md §39/§51
// про иммутабельность касаются результатов/оценок/партнёров, не подписей
// категорий — тот же принцип уже действует для DivisionCategory).
// Не физическое удаление при isActive=false (CLAUDE.md §18) — деактивированный
// этап пропадает из выбора для НОВЫХ раундов, но остаётся у всех уже
// созданных Round.
export async function updateRoundStage(stageId: string, input: UpdateRoundStageInput): Promise<void> {
  const actor = await requirePermission("round_stage:manage");

  try {
    await prisma.$transaction(async (tx) => {
      const before = await tx.roundStageCatalog.findUniqueOrThrow({ where: { id: stageId } });
      const after = await tx.roundStageCatalog.update({
        where: { id: stageId },
        data: {
          name: input.name,
          defaultAdvanceCount: input.defaultAdvanceCount,
          isActive: input.isActive,
        },
      });

      await writeAudit(tx, {
        actor,
        action: "round_stage.update",
        entityType: "RoundStageCatalog",
        entityId: stageId,
        before: { name: before.name, defaultAdvanceCount: before.defaultAdvanceCount, isActive: before.isActive },
        after: { name: after.name, defaultAdvanceCount: after.defaultAdvanceCount, isActive: after.isActive },
      });
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new ValidationFailedError("Этап с таким названием уже существует.");
    }
    throw e;
  }
}
