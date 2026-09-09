import { prisma } from "@/lib/prisma";
import { requirePermission } from "../rbac/authorize";
import { writeAudit, writeAuditMany, type AuditEntry } from "../audit/audit";
import { ValidationFailedError } from "../errors";
import { getOrCreateLatestRulesVersion } from "./rules-version";

// Авто-раскладка сетки раундов+заездов дивизиона по ПЛАНУ этого дивизиона
// (docs/00_DECISIONS.md, A14) — план "сколько пар участвует в каждом этапе"
// задаётся один раз при создании дивизиона (DivisionStagePlan) и дальше не
// меняется. Явное действие организатора (кнопка "Перегенерировать раунды"),
// не происходит само по себе.
//
// Автопропуск этапов, которые никого не отсеивают (2026-09-06, по прямому
// запросу пользователя — разворот части A14, см. docs/00_DECISIONS.md,
// дополнение "A29"): план — это по-прежнему ЕДИНСТВЕННЫЙ источник чисел
// (никаких магических порогов из каталога), но перед генерацией сравнивается
// с реальным числом зарегистрированных+зачекиненных (по ролям отдельно —
// см. selectStepsToGenerate). Для первого этапа сравнение идёт с реальными
// живыми числами; для последующих — с числами ИЗ ПЛАНА (реальный результат
// судейства следующих этапов на момент генерации ещё не известен). Последний
// этап плана (обычно "Финал") не пропускается никогда — там определяются
// места, а не отсев.
//
// Пересборка (2026-09-04, по запросу пользователя): если у дивизиона уже
// есть раунды, они не ДОБАВЛЯЮТСЯ к существующим, а заменяют их — старые
// удаляются (каскадом снимает Heat/Draw/DrawParticipant/HeatRotation/
// RoundResult), новые создаются заново с order=1. Разрешено, пока ни один
// раунд ещё не зафиксирован (DRAW_LOCKED и позже) — граница совпадает с
// CLAUDE.md §39 ("locked draw" неизменяем), а не с READY: жеребьёвка
// (DRAWING) сама по себе — черновик, её и так можно править поштучно
// (RerollDrawButton/SplitHeatButton/AddDrawHelperForm работают именно в
// DRAWING) — раньше пересборка блокировалась уже на DRAWING, хотя ничего
// реального ещё не зафиксировано; организатор, заметивший ошибку в плане
// раундов уже во время жеребьёвки, не мог её исправить иначе как через SQL
// (найдено по прямому запросу пользователя на живом тесте, 2026-09-09).

export type PlanStep = { stageId: string; stageName: string; participantCount: number; finalistsCount: number };

// Чистая функция (тестируется отдельно, без БД) — решает, какие этапы плана
// реально нужны. Этап пропускается, если он НИКОГО не отсеивает: и текущее
// число ведущих, и текущее число ведомых уже <= порога этого этапа
// (finalistsCount). Последний этап плана исключением быть не может — он
// всегда возвращается.
export function selectStepsToGenerate(steps: PlanStep[], liveCounts: { leaders: number; followers: number }): PlanStep[] {
  const included: PlanStep[] = [];
  let leaders = liveCounts.leaders;
  let followers = liveCounts.followers;
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const isLast = i === steps.length - 1;
    if (!isLast && leaders <= step.finalistsCount && followers <= step.finalistsCount) {
      continue; // этап никого не отсеивает — пропускаем, пул переходит дальше без изменений
    }
    included.push(step);
    if (!isLast) {
      // Дальше считаем не по факту (реальные результаты судейства этого
      // этапа ещё не известны на момент генерации), а по плану — организатор
      // сам решил, сколько реально дойдёт до следующего этапа.
      leaders = Math.min(leaders, step.finalistsCount);
      followers = Math.min(followers, step.finalistsCount);
    }
  }
  return included;
}

export async function generateRounds(divisionId: string): Promise<{ createdRoundIds: string[] }> {
  // Division + план дивизиона + существующие раунды — одним запросом
  // (relationLoadStrategy: "join") вместо трёх отдельных round-trip'ов к
  // Supabase pooler (~150мс каждый сам по себе, задокументированная
  // сетевая цена — не сложность запроса). Найдено вживую в Performance
  // Diagnostic Mode (docs/PROGRESS.md). Данные и порядок те же, что и раньше
  // — только способ получения.
  const division = await prisma.division.findFirstOrThrow({
    where: { id: divisionId },
    select: {
      id: true,
      competitionId: true,
      heatCapacity: true,
      judgingMaxScore: true,
      stagePlan: { orderBy: { stage: { order: "asc" } }, include: { stage: true } },
      rounds: { select: { id: true, status: true, stage: { select: { name: true } } } },
    },
    relationLoadStrategy: "join",
  });
  const actor = await requirePermission("round:create", division.competitionId);

  const plan = division.stagePlan;
  const existingRounds = division.rounds;

  if (plan.length === 0) {
    throw new ValidationFailedError(
      "Для этой категории не задан план по этапам («сколько пар участвует в каждом раунде») — он настраивается один раз при добавлении категории."
    );
  }

  const lockedRound = existingRounds.find((r) => r.status !== "DRAFT" && r.status !== "READY" && r.status !== "DRAWING");
  if (lockedRound) {
    throw new ValidationFailedError(
      `Нельзя перегенерировать раунды: раунд «${lockedRound.stage?.name ?? "—"}» уже зафиксирован (заезды/судейство) — пересборка удалила бы реальные результаты.`
    );
  }

  // finalistsCount раунда этапа X = participantCount СЛЕДУЮЩЕГО по порядку
  // этапа плана (сколько проходит из X в X+1); у последнего этапа плана
  // следующего нет — число идёт как есть (сколько мест/победителей).
  const allSteps: PlanStep[] = plan.map((p, i) => ({
    stageId: p.stageId,
    stageName: p.stage.name,
    participantCount: p.participantCount,
    finalistsCount: i < plan.length - 1 ? plan[i + 1].participantCount : p.participantCount,
  }));

  // Реальные зарегистрированные+зачекиненные по ролям (тот же фильтр, что и
  // getRoundEligiblePool, draw-engine.ts) — используются только для решения
  // "нужен ли первый этап по факту", дальше selectStepsToGenerate считает по
  // плану (см. комментарий выше).
  const [liveLeaders, liveFollowers] = await Promise.all([
    prisma.registration.count({
      where: { divisionId, role: "LEADER", status: "REGISTERED", checkIn: { is: { status: { in: ["CHECKED_IN", "LATE"] } } } },
    }),
    prisma.registration.count({
      where: { divisionId, role: "FOLLOWER", status: "REGISTERED", checkIn: { is: { status: { in: ["CHECKED_IN", "LATE"] } } } },
    }),
  ]);
  const steps = selectStepsToGenerate(allSteps, { leaders: liveLeaders, followers: liveFollowers });
  const skippedStageNames = allSteps.filter((s) => !steps.includes(s)).map((s) => s.stageName);

  const createdRoundIds = await prisma.$transaction(async (tx) => {
    if (existingRounds.length > 0) {
      await writeAudit(tx, {
        actor,
        action: "division.regenerate_rounds",
        entityType: "Division",
        entityId: divisionId,
        before: { deletedRoundIds: existingRounds.map((r) => r.id) },
        reason: "Пересборка: ни один раунд ещё не начат, старые раунды заменяются планом дивизиона.",
      });
      // Каскадом снимает Heat/Draw/DrawParticipant/HeatRotation/RoundResult —
      // безопасно, т.к. все существующие раунды ещё DRAFT/READY (проверено
      // выше), реальных результатов там нет.
      await tx.round.deleteMany({ where: { divisionId } });
    }

    const rules = await getOrCreateLatestRulesVersion(tx, division.competitionId, actor);
    const ids: string[] = [];
    // Каждый Round/Heat всё равно получает свою собственную audit-запись с
    // корректными after (CLAUDE.md §28) — батчится только сама вставка в
    // конце (writeAuditMany), а не её содержимое. Нельзя было бы сделать то
    // же для СОЗДАНИЯ Round/Heat через createMany — heat.roundId зависит от
    // id только что созданного round, вставки внутри цикла остаются
    // последовательными.
    const auditEntries: AuditEntry[] = [];

    for (const [i, step] of steps.entries()) {
      const order = i + 1;
      const round = await tx.round.create({
        data: {
          divisionId,
          stageId: step.stageId,
          order,
          finalistsCount: step.finalistsCount,
          rulesId: rules.id,
          judgingMaxScore: division.judgingMaxScore,
        },
      });
      ids.push(round.id);

      auditEntries.push({
        actor,
        action: "round.create",
        entityType: "Round",
        entityId: round.id,
        after: {
          divisionId,
          stageId: step.stageId,
          stageName: step.stageName,
          order,
          participantCount: step.participantCount,
          finalistsCount: step.finalistsCount,
          rulesId: rules.id,
          judgingMaxScore: division.judgingMaxScore,
          autoGenerated: true,
        },
      });

      const heatCount = Math.ceil(step.participantCount / division.heatCapacity);
      for (let number = 1; number <= heatCount; number++) {
        const heat = await tx.heat.create({ data: { roundId: round.id, number } });
        auditEntries.push({
          actor,
          action: "heat.create",
          entityType: "Heat",
          entityId: heat.id,
          after: { roundId: round.id, number, autoGenerated: true },
        });
      }
    }

    await writeAuditMany(tx, auditEntries);

    await writeAudit(tx, {
      actor,
      action: "division.generate_rounds",
      entityType: "Division",
      entityId: divisionId,
      after: { createdRoundIds: ids, stagesUsed: steps.map((s) => s.stageName), skippedStages: skippedStageNames },
    });

    return ids;
  });

  return { createdRoundIds };
}
