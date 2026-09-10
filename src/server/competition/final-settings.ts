import type { FinalFormat, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "../rbac/authorize";
import { writeAudit } from "../audit/audit";
import { ValidationFailedError } from "../errors";
import type { SetFinalCriteriaInput, SetFinalSettingsInput } from "./schemas";

// Настройки формата финала и критерии оценки — на уровне Division (Этап 9,
// docs/00_DECISIONS.md A22). До старта финала (FinalSession ещё не создана)
// организатор может менять их сколько угодно; после старта — заблокированы
// (снимок уже лежит в FinalSession, CLAUDE.md §50-51).
async function assertNotLocked(divisionId: string): Promise<void> {
  const locked = await prisma.finalSession.findFirst({ where: { round: { divisionId } } });
  if (locked) {
    throw new ValidationFailedError("Финал уже начат — формат и критерии заблокированы (правила уже зафиксированы снимком).");
  }
}

export type FinalCriterionView = {
  id: string;
  name: string;
  priority: number;
  minScore: number;
  maxScore: number;
  step: number;
  sortOrder: number;
  isActive: boolean;
};

export type FinalSettingsView = {
  format: FinalFormat;
  tracksCount: number;
  partnerChangeEnabled: boolean;
  config: unknown;
  criteria: FinalCriterionView[];
  locked: boolean;
};

export async function getFinalSettings(divisionId: string): Promise<FinalSettingsView> {
  const division = await prisma.division.findUniqueOrThrow({ where: { id: divisionId }, select: { competitionId: true } });
  await requirePermission("final:configure", division.competitionId);

  const [settings, criteria, session] = await Promise.all([
    prisma.finalSettings.findUnique({ where: { divisionId } }),
    prisma.finalCriterion.findMany({ where: { divisionId }, orderBy: { sortOrder: "asc" } }),
    prisma.finalSession.findFirst({ where: { round: { divisionId } } }),
  ]);

  return {
    format: settings?.format ?? "NORMAL",
    tracksCount: settings?.tracksCount ?? 1,
    partnerChangeEnabled: settings?.partnerChangeEnabled ?? false,
    config: settings?.config ?? {},
    criteria,
    locked: session !== null,
  };
}

export async function setFinalSettings(divisionId: string, input: SetFinalSettingsInput): Promise<void> {
  const division = await prisma.division.findUniqueOrThrow({ where: { id: divisionId }, select: { competitionId: true } });
  const actor = await requirePermission("final:configure", division.competitionId);
  await assertNotLocked(divisionId);

  await prisma.$transaction(async (tx) => {
    const before = await tx.finalSettings.findUnique({ where: { divisionId } });
    const after = await tx.finalSettings.upsert({
      where: { divisionId },
      create: {
        divisionId,
        format: input.format,
        tracksCount: input.tracksCount,
        partnerChangeEnabled: input.partnerChangeEnabled,
        config: input.config as Prisma.InputJsonValue,
      },
      update: {
        format: input.format,
        tracksCount: input.tracksCount,
        partnerChangeEnabled: input.partnerChangeEnabled,
        config: input.config as Prisma.InputJsonValue,
      },
    });
    await writeAudit(tx, {
      actor,
      action: before ? "final_settings.update" : "final_settings.create",
      entityType: "FinalSettings",
      entityId: after.id,
      before: before
        ? { format: before.format, tracksCount: before.tracksCount, partnerChangeEnabled: before.partnerChangeEnabled, config: before.config }
        : undefined,
      after: { format: after.format, tracksCount: after.tracksCount, partnerChangeEnabled: after.partnerChangeEnabled, config: after.config },
    });
  });
}

// Реконсиляция дифом, одним "Сохранить" (как setDivisionJudges) —
// присланный список критериев ПОЛНОСТЬЮ заменяет текущий: существующие
// (есть id) обновляются, новые (без id) создаются, отсутствующие в списке
// удаляются. Приоритеты обязаны быть уникальны и идти подряд 1..N — иначе
// лексикографическое сравнение при ничье (final-ranking.ts) неоднозначно.
export async function setFinalCriteria(divisionId: string, input: SetFinalCriteriaInput) {
  const division = await prisma.division.findUniqueOrThrow({ where: { id: divisionId }, select: { competitionId: true } });
  const actor = await requirePermission("final:configure", division.competitionId);
  await assertNotLocked(divisionId);

  const sortedPriorities = input.criteria.map((c) => c.priority).sort((a, b) => a - b);
  const expected = sortedPriorities.map((_, i) => i + 1);
  if (JSON.stringify(sortedPriorities) !== JSON.stringify(expected)) {
    throw new ValidationFailedError("Приоритеты критериев должны быть уникальны и идти подряд без пропусков: 1, 2, 3, ...");
  }

  const existing = await prisma.finalCriterion.findMany({ where: { divisionId } });
  const existingIds = new Set(existing.map((c) => c.id));
  const keepIds = new Set(input.criteria.filter((c) => c.id).map((c) => c.id!));
  for (const id of keepIds) {
    if (!existingIds.has(id)) throw new ValidationFailedError("Один из критериев не найден в этой категории.");
  }
  const toDelete = existing.filter((c) => !keepIds.has(c.id));
  const existingToUpdate = input.criteria.filter((c) => c.id);

  return await prisma.$transaction(async (tx) => {
    if (toDelete.length > 0) {
      await tx.finalCriterion.deleteMany({ where: { id: { in: toDelete.map((c) => c.id) } } });
      // CODE-002 (найдено по жалобе пользователя, 2026-09-10): удаление
      // критерия, на который ссылается FinalSettings.config.dancingJudgeCriteriaIds
      // (JUDGES_DANCE — "какие критерии оценивает танцующий судья"), раньше
      // оставляло в config ссылку на уже удалённый id — checkFinalReadiness
      // (start-final.ts) находила её и блокировала старт финала с непонятной
      // организатору ошибкой "указан несуществующий критерий", хотя сам
      // критерий давно заменён другим через эту же форму. Чистим ссылку сразу
      // здесь, в одной транзакции с удалением — единственное место, которое
      // реально удаляет FinalCriterion, поэтому единственное надёжное место
      // держать это в согласованном состоянии.
      const settings = await tx.finalSettings.findUnique({ where: { divisionId } });
      const config = settings?.config as { dancingJudgeCriteriaIds?: string[] } | null;
      const dancingIds = config?.dancingJudgeCriteriaIds;
      if (settings && Array.isArray(dancingIds)) {
        const deletedIds = new Set(toDelete.map((c) => c.id));
        const cleaned = dancingIds.filter((id) => !deletedIds.has(id));
        if (cleaned.length !== dancingIds.length) {
          await tx.finalSettings.update({
            where: { divisionId },
            data: { config: { ...config, dancingJudgeCriteriaIds: cleaned } as Prisma.InputJsonValue },
          });
        }
      }
    }
    // Сначала сбрасываем priority существующих в заведомо непересекающиеся
    // отрицательные значения — иначе обновление на финальные значения может
    // столкнуться с @@unique([divisionId, priority]) посередине процесса
    // при перестановке (тот же приём, что и сдвиг order раундов при вставке
    // перетанцовки, advancement.ts).
    for (let i = 0; i < existingToUpdate.length; i++) {
      await tx.finalCriterion.update({ where: { id: existingToUpdate[i].id! }, data: { priority: -(i + 1) } });
    }
    let sortOrder = 0;
    for (const c of input.criteria) {
      if (c.id) {
        await tx.finalCriterion.update({
          where: { id: c.id },
          data: { name: c.name, priority: c.priority, minScore: c.minScore, maxScore: c.maxScore, step: c.step, sortOrder, catalogId: c.catalogId ?? null },
        });
      } else {
        await tx.finalCriterion.create({
          data: { divisionId, name: c.name, priority: c.priority, minScore: c.minScore, maxScore: c.maxScore, step: c.step, sortOrder, catalogId: c.catalogId ?? null },
        });
      }
      sortOrder++;
    }
    await writeAudit(tx, {
      actor,
      action: "final_criteria.set",
      entityType: "Division",
      entityId: divisionId,
      after: { criteria: input.criteria.map((c) => ({ name: c.name, priority: c.priority, minScore: c.minScore, maxScore: c.maxScore })) },
    });
    return tx.finalCriterion.findMany({ where: { divisionId }, orderBy: { priority: "asc" } });
  });
}
