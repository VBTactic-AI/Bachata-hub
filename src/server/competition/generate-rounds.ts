import { prisma } from "@/lib/prisma";
import { requirePermission } from "../rbac/authorize";
import { writeAudit, writeAuditMany, type AuditEntry } from "../audit/audit";
import { ValidationFailedError } from "../errors";
import { getOrCreateLatestRulesVersion } from "./rules-version";

// Авто-раскладка сетки раундов+заездов дивизиона по ПЛАНУ этого дивизиона
// (docs/00_DECISIONS.md, A14) — план "сколько пар участвует в каждом этапе"
// задаётся один раз при создании дивизиона (DivisionStagePlan) и дальше не
// меняется; раньше (A7) раунды раскладывались сравнением живых чисел
// регистраций с общим RoundStageCatalog.defaultAdvanceCount — теперь
// используется явный план организатора, живые числа не участвуют в расчёте
// (только показываются рядом для сверки, до генерации). Явное действие
// организатора (кнопка "Перегенерировать раунды"), не происходит само по
// себе.
//
// Пересборка (2026-09-04, по запросу пользователя): если у дивизиона уже
// есть раунды, они не ДОБАВЛЯЮТСЯ к существующим, а заменяют их — старые
// удаляются (каскадом снимает Heat/Draw/DrawParticipant/HeatRotation/
// RoundResult), новые создаются заново с order=1. Разрешено только пока ни
// один раунд ещё не сдвинулся дальше READY (жеребьёвка/заезды/оценки не
// начинались) — иначе это будет не пересборка черновика, а тихое удаление
// реальных результатов соревнования (CLAUDE.md §18/§39).
export async function generateRounds(divisionId: string): Promise<{ createdRoundIds: string[] }> {
  // Division + план дивизиона + существующие раунды — одним запросом
  // (relationLoadStrategy: "join") вместо трёх отдельных round-trip'ов к
  // Supabase pooler (~150мс каждый сам по себе, задокументированная
  // сетевая цена — не сложность запроса). Найдено вживую в Performance
  // Diagnostic Mode (docs/PROGRESS.md). Данные и порядок те же, что и раньше
  // — только способ получения.
  const division = await prisma.division.findUniqueOrThrow({
    where: { id: divisionId },
    select: {
      id: true,
      competitionId: true,
      heatCapacity: true,
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
      "Для этого дивизиона не задан план по этапам («сколько пар участвует в каждом раунде») — он настраивается один раз при создании дивизиона."
    );
  }

  const startedRound = existingRounds.find((r) => r.status !== "DRAFT" && r.status !== "READY");
  if (startedRound) {
    throw new ValidationFailedError(
      `Нельзя перегенерировать раунды: раунд «${startedRound.stage?.name ?? "—"}» уже начат (жеребьёвка/заезды/судейство) — пересборка удалила бы реальные результаты.`
    );
  }

  // finalistsCount раунда этапа X = participantCount СЛЕДУЮЩЕГО по порядку
  // этапа плана (сколько проходит из X в X+1); у последнего этапа плана
  // следующего нет — число идёт как есть (сколько мест/победителей).
  type Step = { stageId: string; stageName: string; participantCount: number; finalistsCount: number };
  const steps: Step[] = plan.map((p, i) => ({
    stageId: p.stageId,
    stageName: p.stage.name,
    participantCount: p.participantCount,
    finalistsCount: i < plan.length - 1 ? plan[i + 1].participantCount : p.participantCount,
  }));

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
      after: { createdRoundIds: ids, stagesUsed: steps.map((s) => s.stageName) },
    });

    return ids;
  });

  return { createdRoundIds };
}
