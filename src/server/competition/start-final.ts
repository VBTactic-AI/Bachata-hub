import type { RegistrationRole, RoundStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "../rbac/authorize";
import { writeAudit } from "../audit/audit";
import { ValidationFailedError } from "../errors";
import { isFinalStageInTx } from "../judging/advancement";
import { getRoundEligiblePool } from "./draw-engine";
import { transition } from "../state/machine";

const ROLE_LABEL: Record<RegistrationRole, string> = { LEADER: "Ведущий", FOLLOWER: "Ведомый" };

type JudgesDanceConfig = { dancingJudgeCriteriaIds?: string[] };

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

    // JUDGES_DANCE — какие критерии оценивает танцующий (партнёрящий)
    // судья, а не сторонний (промт пользователя, п.22-23: "scoring matrix").
    // Настраивается в FinalSettings.config.dancingJudgeCriteriaIds.
    if (format === "JUDGES_DANCE") {
      const config = (settings?.config as JudgesDanceConfig | null) ?? {};
      const dancingIds = config.dancingJudgeCriteriaIds ?? [];
      if (dancingIds.length === 0) {
        issues.push('Не выбрано ни одного критерия, который оценивает "танцующий" судья (настройки финала)');
      } else {
        const validIds = new Set(criteria.map((c) => c.id));
        for (const id of dancingIds) {
          if (!validIds.has(id)) issues.push("В настройках финала указан несуществующий критерий");
        }
      }
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
  // RANDOM_COUPLES — пары формируются 1:1 (промт пользователя, п.25-26), не
  // делит на "своя роль проходит без пары"/добор помощников, как Draw
  // Engine обычных раундов (A5) — значит числа обязаны совпасть заранее,
  // иначе кто-то останется без партнёра. НЕ угадываем правило "что делать
  // при разном числе" (CLAUDE.md §25) — просто не даём начать, пока
  // организатор не выровняет регистрацию/check-in.
  if (format === "RANDOM_COUPLES" && pools.leaders.size !== pools.followers.size) {
    issues.push(
      `Для формата "Случайные пары" число ведущих и ведомых должно совпадать — сейчас ${pools.leaders.size} ведущих и ${pools.followers.size} ведомых`
    );
  }

  const assignments = await prisma.judgeAssignment.findMany({ where: { divisionId: round.division.id } });
  if (format === "JUDGES_DANCE") {
    // В JUDGES_DANCE судьи оценивают ПРОТИВОПОЛОЖНУЮ роль по критерию
    // "танцующего" судьи — значит, если есть хоть один финалист (любой
    // роли), нужны судьи ОБЕИХ ролей, не только "своей".
    if (pools.leaders.size > 0 || pools.followers.size > 0) {
      for (const role of ["LEADER", "FOLLOWER"] as const) {
        if (!assignments.some((a) => a.role === role)) {
          issues.push(`Не назначен ни один судья на роль «${ROLE_LABEL[role]}»`);
        }
      }
    }
  } else {
    const rolesWithFinalists: RegistrationRole[] = [];
    if (pools.leaders.size > 0) rolesWithFinalists.push("LEADER");
    if (pools.followers.size > 0) rolesWithFinalists.push("FOLLOWER");
    for (const role of rolesWithFinalists) {
      if (!assignments.some((a) => a.role === role)) {
        issues.push(`Не назначен ни один судья на роль «${ROLE_LABEL[role]}»`);
      }
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

  // JUDGES_DANCE и RANDOM_COUPLES не проходят через обычный Draw Engine
  // (READY -> DRAWING -> DRAW_LOCKED -> RUNNING) — там нет ни выбора порядка
  // вызова, ни парной жеребьёвки по образцу обычных раундов (A5): в
  // JUDGES_DANCE партнёр участника — судья, не другой финалист; в
  // RANDOM_COUPLES пары формируются случайно по одной через явное действие
  // организатора, а не все разом. Заходы формируются по одному через
  // advanceJudgesDanceStage / advanceRandomCouples. Переводим раунд сразу
  // READY -> RUNNING отдельным разрешённым переходом (не трогая общую
  // таблицу переходов round-state.ts — она остаётся прежней для NORMAL),
  // через тот же transition()-примитив, что и обычные переходы (та же
  // блокировка/аудит, CLAUDE.md §9/§27).
  if (format === "JUDGES_DANCE" || format === "RANDOM_COUPLES") {
    const table: Partial<Record<RoundStatus, readonly RoundStatus[]>> = { READY: ["RUNNING"] };
    await transition({
      entityType: "Round",
      entityId: roundId,
      table,
      currentStatus: "READY",
      statusVersion: round.statusVersion,
      to: "RUNNING",
      actor,
      reason: `Начало финала формата «${format === "JUDGES_DANCE" ? "Танец с судьями" : "Случайные пары"}» — минует обычную жеребьёвку.`,
      applyUpdate: async (tx, { to, expectedVersion }) => {
        const result = await tx.round.updateMany({
          where: { id: roundId, statusVersion: expectedVersion },
          data: { status: to, statusVersion: { increment: 1 } },
        });
        if (result.count > 0) {
          // generateRounds() создаёт по умолчанию заход №1 сразу вместе с
          // раундом (по образцу NORMAL-формата, до того как организатор мог
          // выбрать формат финала) — эти форматы его не используют вовсе
          // (свои заходы создаются по одному, с теми же номерами 1/2/...) и
          // без этой уборки столкнулись бы с @@unique([roundId, number]).
          // Безопасно удалять: раунд только что был READY, значит ни один
          // заход ещё не мог запуститься/получить жеребьёвку.
          await tx.heat.deleteMany({ where: { roundId, draws: { none: {} } } });
        }
        return {
          before: { status: "READY" },
          after: { status: to },
          updatedCount: result.count,
        };
      },
    });
  }

  return { id: session.id };
}
