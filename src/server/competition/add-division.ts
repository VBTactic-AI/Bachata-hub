import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "../rbac/authorize";
import { writeAudit } from "../audit/audit";
import { ValidationFailedError } from "../errors";
import type { AddDivisionInput, UpdateDivisionSettingsInput } from "./schemas";

export async function addDivision(competitionId: string, input: AddDivisionInput): Promise<{ id: string }> {
  const actor = await requirePermission("competition:update", competitionId);

  // Категория обязана существовать и быть активной — сама форма отдаёт на
  // выбор только активные, но проверяем и на сервере (CLAUDE.md §44:
  // валидация нужна и на бэкенде), на случай прямого вызова API.
  const category = await prisma.divisionCategory.findUnique({ where: { id: input.categoryId } });
  if (!category || !category.isActive) {
    throw new ValidationFailedError("Выбранная категория недоступна.");
  }

  // Один дивизион на категорию в рамках соревнования (@@unique в схеме) —
  // сама форма уже не предлагает занятые категории на выбор, но проверяем и
  // на сервере понятным сообщением, а не общей ошибкой 500 (CLAUDE.md §44/§46).
  const existing = await prisma.division.findUnique({
    where: { competitionId_categoryId: { competitionId, categoryId: input.categoryId } },
  });
  if (existing) {
    throw new ValidationFailedError(`Категория «${category.name}» уже добавлена в это соревнование.`);
  }

  // План "сколько пар участвует в каждом этапе" (docs/00_DECISIONS.md, A14) —
  // тоже проверяем на сервере, даже если форма отдаёт только активные этапы.
  const stagePlan = input.stagePlan ?? [];
  const stageIds = stagePlan.map((s) => s.stageId);
  if (stageIds.length > 0) {
    if (new Set(stageIds).size !== stageIds.length) {
      throw new ValidationFailedError("В плане по этапам один и тот же этап указан дважды.");
    }
    const stages = await prisma.roundStageCatalog.findMany({ where: { id: { in: stageIds }, isActive: true } });
    if (stages.length !== stageIds.length) {
      throw new ValidationFailedError("В плане по этапам есть недоступный этап.");
    }
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
        rotationMode: input.rotationMode,
        rotationIntervalSec: input.rotationIntervalSec,
        rotationShiftMin: input.rotationShiftMin,
        rotationShiftMax: input.rotationShiftMax,
        judgingMaxScore: input.judgingMaxScore,
        rules: (input.rules ?? {}) as Prisma.InputJsonValue,
      },
    });

    await writeAudit(tx, {
      actor,
      action: "division.create",
      entityType: "Division",
      entityId: created.id,
      after: {
        competitionId,
        categoryId: created.categoryId,
        categoryName: category.name,
        judgingMaxScore: created.judgingMaxScore,
      },
    });

    if (stagePlan.length > 0) {
      await tx.divisionStagePlan.createMany({
        data: stagePlan.map((s) => ({ divisionId: created.id, stageId: s.stageId, participantCount: s.participantCount })),
      });
      await writeAudit(tx, {
        actor,
        action: "division.set_stage_plan",
        entityType: "Division",
        entityId: created.id,
        after: { stagePlan },
        reason: "Задаётся один раз при создании дивизиона, до начала соревнования, дальше не меняется (влияет на расчёт cutoff).",
      });
    }

    return created;
  });

  return { id: division.id };
}

// Соревнование ещё не началось — то же понятие, что уже используют
// generateRounds()/round-state.ts неявно (раунды не могут стартовать раньше
// LIVE): судейский метод раундов до финала завязан на расчёт cutoff
// (Advancement Engine), поэтому пользователь явно ограничил его правку этим
// окном (2026-09-09), а не только тем, что ни один раунд ещё не стартовал.
const COMPETITION_NOT_STARTED_STATUSES = new Set(["DRAFT", "REGISTRATION_OPEN", "REGISTRATION_CLOSED", "CHECK_IN", "READY"]);

// Изменение вместимости/ротации уже созданного дивизиона — по запросу
// пользователя (2026-09-04): доступно в любой момент через явный "режим
// редактирования" на экране (кнопка "Изменить настройки"), не голое поле,
// которое можно случайно задеть. Категория не меняется здесь.
//
// judgingMaxScore (метод оценки раундов до финала) — раньше вообще не входил
// в эту форму (фиксировался один раз при создании дивизиона). По запросу
// пользователя (2026-09-09, вкладка "Судьи" → "Настройки судейства") стал
// редактируемым, но ТОЛЬКО до старта соревнования (см.
// COMPETITION_NOT_STARTED_STATUSES выше) — уже созданные раунды хранят свой
// снимок значения (Round.judgingMaxScore) и им эта правка не грозит
// (CLAUDE.md §50-51), но менять "правила игры" на живом соревновании всё
// равно не должно быть возможно.
export async function updateDivisionSettings(divisionId: string, input: UpdateDivisionSettingsInput): Promise<void> {
  const division = await prisma.division.findUniqueOrThrow({
    where: { id: divisionId },
    select: {
      competitionId: true,
      heatCapacity: true,
      rotationMode: true,
      rotationIntervalSec: true,
      rotationShiftMin: true,
      rotationShiftMax: true,
      judgingMaxScore: true,
      competition: { select: { status: true } },
      _count: { select: { rounds: true } },
      stagePlan: { select: { stageId: true, participantCount: true } },
    },
  });
  const actor = await requirePermission("competition:update", division.competitionId);

  if (input.rotationShiftMin > input.rotationShiftMax) {
    throw new ValidationFailedError("Минимальное число партнёров для смены не может быть больше максимального.");
  }

  if (input.judgingMaxScore !== undefined && !COMPETITION_NOT_STARTED_STATUSES.has(division.competition.status)) {
    throw new ValidationFailedError("Метод оценки раундов до финала можно менять только до старта соревнования.");
  }

  // Вместимость паркета и план по этапам — по прямому запросу пользователя
  // (2026-09-09) стали редактируемыми через панель категории, но ТОЛЬКО пока
  // для категории ещё не сгенерированы раунды ("категория стартовала" —
  // организатор сам это назвал границей: как только раунды есть, менять
  // ничего нельзя, кнопка редактирования на экране становится неактивной).
  // Раунды уже хранят свой снимок (Round.finalistsCount/heatCapacity) —
  // задним числом им это не грозит (CLAUDE.md §50-51), но дальше план и
  // вместимость применяются только через "Перегенерировать раунды".
  const hasRounds = division._count.rounds > 0;
  if (input.heatCapacity !== undefined && hasRounds) {
    throw new ValidationFailedError("Вместимость паркета можно менять только пока для категории не сгенерированы раунды.");
  }
  if (input.stagePlan !== undefined) {
    if (hasRounds) {
      throw new ValidationFailedError("План по этапам можно менять только пока для категории не сгенерированы раунды.");
    }
    const stageIds = input.stagePlan.map((s) => s.stageId);
    if (new Set(stageIds).size !== stageIds.length) {
      throw new ValidationFailedError("В плане по этапам один и тот же этап указан дважды.");
    }
    if (stageIds.length > 0) {
      const stages = await prisma.roundStageCatalog.findMany({ where: { id: { in: stageIds }, isActive: true } });
      if (stages.length !== stageIds.length) {
        throw new ValidationFailedError("В плане по этапам есть недоступный этап.");
      }
    }
  }

  const { stagePlan, ...divisionFields } = input;

  await prisma.$transaction(async (tx) => {
    await tx.division.update({ where: { id: divisionId }, data: divisionFields });
    await writeAudit(tx, {
      actor,
      action: "division.update_settings",
      entityType: "Division",
      entityId: divisionId,
      before: division,
      after: divisionFields,
    });

    if (stagePlan !== undefined) {
      // Реконсиляция полной заменой (как и при создании нет частичного
      // patch-а на один этап) — старый план целиком снимается, новый
      // создаётся заново; безопасно, т.к. hasRounds уже проверен выше.
      await tx.divisionStagePlan.deleteMany({ where: { divisionId } });
      if (stagePlan.length > 0) {
        await tx.divisionStagePlan.createMany({
          data: stagePlan.map((s) => ({ divisionId, stageId: s.stageId, participantCount: s.participantCount })),
        });
      }
      await writeAudit(tx, {
        actor,
        action: "division.update_stage_plan",
        entityType: "Division",
        entityId: divisionId,
        before: { stagePlan: division.stagePlan },
        after: { stagePlan },
      });
    }
  });
}

// Удаление дивизиона — не "скрытие" (в отличие от DivisionCategory,
// CLAUDE.md §18): это конкретный, ещё ничем не заполненный дивизион ЭТОГО
// соревнования, не общий справочник. По запросу пользователя (2026-09-04,
// сценарий "не набралось минимальное число участников"). Защита: нельзя
// удалить, если на дивизион уже есть хоть одна регистрация — тогда это уже
// не пустой черновик, а реальные данные участников, которые нельзя терять
// молча (CLAUDE.md §18).
export async function deleteDivision(divisionId: string): Promise<void> {
  const division = await prisma.division.findUniqueOrThrow({
    where: { id: divisionId },
    include: { category: { select: { name: true } }, _count: { select: { registrations: true } } },
  });
  const actor = await requirePermission("competition:update", division.competitionId);

  if (division._count.registrations > 0) {
    throw new ValidationFailedError(
      "Нельзя удалить категорию — на неё уже есть регистрации участников. Сначала снимите их регистрации."
    );
  }

  await prisma.$transaction(async (tx) => {
    await writeAudit(tx, {
      actor,
      action: "division.delete",
      entityType: "Division",
      entityId: divisionId,
      before: { competitionId: division.competitionId, categoryName: division.category.name },
    });
    await tx.division.delete({ where: { id: divisionId } });
  });
}
