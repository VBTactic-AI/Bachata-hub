import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "../rbac/authorize";
import { writeAudit } from "../audit/audit";
import { ValidationFailedError } from "../errors";
import type { CreateRoundStageInput } from "./schemas";

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

// Не физическое удаление (CLAUDE.md §18) — деактивированный этап пропадает
// из выбора для НОВЫХ раундов, но остаётся у всех уже созданных Round.
export async function setRoundStageActive(stageId: string, isActive: boolean): Promise<void> {
  const actor = await requirePermission("round_stage:manage");

  await prisma.$transaction(async (tx) => {
    const before = await tx.roundStageCatalog.findUniqueOrThrow({ where: { id: stageId } });
    const after = await tx.roundStageCatalog.update({ where: { id: stageId }, data: { isActive } });

    await writeAudit(tx, {
      actor,
      action: "round_stage.set_active",
      entityType: "RoundStageCatalog",
      entityId: stageId,
      before: { isActive: before.isActive },
      after: { isActive: after.isActive },
    });
  });
}
