import type { RegistrationRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "../rbac/authorize";
import { writeAudit } from "../audit/audit";
import { ValidationFailedError } from "../errors";
import { isFinalStageInTx } from "../judging/advancement";
import { getRoundEligiblePool } from "./draw-engine";

const ROLE_LABEL: Record<RegistrationRole, string> = { LEADER: "Ведущий", FOLLOWER: "Ведомый" };

// Проверка готовности перед стартом финала (промт пользователя, п.50) — не
// бросает исключение, возвращает список проблем, чтобы UI мог показать их
// администратору целиком, а не по одной. НЕ разрешаем начать финал, пока
// список не пуст (CLAUDE.md §46 — понятные ошибки, не угадывать).
export async function checkFinalReadiness(roundId: string): Promise<string[]> {
  const round = await prisma.round.findUniqueOrThrow({
    where: { id: roundId },
    include: { division: { select: { id: true, competitionId: true } } },
  });
  const issues: string[] = [];

  const isFinal = await isFinalStageInTx(prisma, round.division.id, round.order);
  if (!isFinal) {
    issues.push("Это не финальный раунд дивизиона — новая система судейства финала применяется только к последнему раунду");
    return issues;
  }

  const settings = await prisma.finalSettings.findUnique({ where: { divisionId: round.division.id } });
  const format = settings?.format ?? "NORMAL";
  // Пока реализован только формат NORMAL (Этап 9, шаг 2) — честно сообщаем
  // об этом ограничении, а не притворяемся, что остальные форматы работают.
  if (format !== "NORMAL") {
    issues.push(`Формат «${format}» ещё не реализован в этой версии — пока доступен только обычный J&J-финал (NORMAL)`);
  }

  const criteria = await prisma.finalCriterion.findMany({ where: { divisionId: round.division.id, isActive: true } });
  if (criteria.length === 0) {
    issues.push("Не заданы критерии оценки финала");
  } else {
    const priorities = criteria.map((c) => c.priority).sort((a, b) => a - b);
    const expected = priorities.map((_, i) => i + 1);
    if (JSON.stringify(priorities) !== JSON.stringify(expected)) {
      issues.push("Приоритеты критериев должны быть уникальны и идти подряд без пропусков (1, 2, 3, ...)");
    }
    for (const c of criteria) {
      if (c.maxScore <= c.minScore) issues.push(`Критерий «${c.name}»: некорректный диапазон оценок`);
    }
  }

  const pools = await prisma.$transaction(async (tx) => {
    const leaders = await getRoundEligiblePool(tx, { divisionId: round.division.id, roundOrder: round.order, role: "LEADER" });
    const followers = await getRoundEligiblePool(tx, { divisionId: round.division.id, roundOrder: round.order, role: "FOLLOWER" });
    return { leaders, followers };
  });
  if (pools.leaders.size === 0 && pools.followers.size === 0) {
    issues.push("Нет ни одного финалиста, прошедшего check-in");
  }

  const assignments = await prisma.judgeAssignment.findMany({ where: { divisionId: round.division.id } });
  const rolesWithFinalists: RegistrationRole[] = [];
  if (pools.leaders.size > 0) rolesWithFinalists.push("LEADER");
  if (pools.followers.size > 0) rolesWithFinalists.push("FOLLOWER");
  for (const role of rolesWithFinalists) {
    if (!assignments.some((a) => a.role === role)) {
      issues.push(`Не назначен ни один судья на роль «${ROLE_LABEL[role]}»`);
    }
  }

  return issues;
}

// Явное действие "Начать финал" (отдельное от обычного "Начать жеребьёвку",
// промт пользователя п.50-51) — фиксирует снимок формата/критериев в
// FinalSession, после чего FinalSettings/FinalCriterion этого дивизиона
// заблокированы (final-settings.ts, assertNotLocked). Идемпотентно: повторный
// вызов на уже начатом финале просто возвращает существующую сессию, ничего
// не пересоздаёт (CLAUDE.md §11).
export async function startFinal(roundId: string): Promise<{ id: string }> {
  const round = await prisma.round.findUniqueOrThrow({
    where: { id: roundId },
    include: { division: { select: { id: true, competitionId: true } } },
  });
  const actor = await requirePermission("final:manage", round.division.competitionId);

  const existing = await prisma.finalSession.findUnique({ where: { roundId } });
  if (existing) return { id: existing.id };

  if (round.status !== "READY") {
    throw new ValidationFailedError('Финал можно начать только из статуса "Готово" (до жеребьёвки).');
  }

  const issues = await checkFinalReadiness(roundId);
  if (issues.length > 0) {
    throw new ValidationFailedError(`Нельзя начать финал: ${issues.join("; ")}.`);
  }

  const [settings, criteria] = await Promise.all([
    prisma.finalSettings.findUnique({ where: { divisionId: round.division.id } }),
    prisma.finalCriterion.findMany({ where: { divisionId: round.division.id, isActive: true }, orderBy: { priority: "asc" } }),
  ]);
  const format = settings?.format ?? "NORMAL";

  const session = await prisma.$transaction(async (tx) => {
    const created = await tx.finalSession.create({
      data: {
        roundId,
        format,
        criteriaSnapshot: criteria.map((c) => ({
          id: c.id,
          name: c.name,
          priority: c.priority,
          minScore: c.minScore,
          maxScore: c.maxScore,
          step: c.step,
        })),
        config: settings?.config ?? {},
      },
    });
    await writeAudit(tx, {
      actor,
      action: "final.start",
      entityType: "Round",
      entityId: roundId,
      after: { format, criteriaCount: criteria.length },
      reason: "Начало финала — правила зафиксированы снимком, настройки формата/критериев заблокированы.",
    });
    return created;
  });

  return { id: session.id };
}
