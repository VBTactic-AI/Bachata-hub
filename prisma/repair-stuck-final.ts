// Разблокировка КРИТЕРИАЛЬНОГО финала (FinalSession — Этап 9/A22),
// зависшего в SCORING при полностью собранных оценках/подтверждениях.
//
// Тот же принцип, что и у repair-stuck-round.ts (который сознательно
// пропускает финалы — "у него свой движок подсчёта"), только для finalSession:
// вызывает ту же боевую функцию maybeFinalizeFinalAfterScoreInTx, что и
// обычный путь (submitFinalJudgeScore/confirmFinalJudgeRoundDone), а не правит
// статус/результат напрямую — audit и расчёт получаются такими же, как если
// бы автоматика сработала вовремя (CLAUDE.md §12/§28/§60).
//
// Реальный случай, который это чинит (2026-09-10, "Профи"): confirmFinal-
// JudgeHeatDone (JUDGES_DANCE, подтверждение ПО ЗАХОДУ) писал только
// JudgeHeatConfirmation, а getFinalScoringProgressInTx до фикса в
// final-advancement.ts продолжал читать JudgeRoundConfirmation — раунд
// физически не мог понять, что все судьи уже подтвердили "Готово" по каждому
// своему заходу, и не пересчитывал результат ни разу. Фикс закрывает дыру
// НА БУДУЩЕЕ (новое событие снова триггерит калькуляцию правильно); раунды,
// уже зависшие ДО фикса, калькулировать больше нечему — этот скрипт досчитывает
// их один раз вручную тем же (уже исправленным) кодом.
//
// Запуск:
//   npx tsx prisma/repair-stuck-final.ts --dry-run      # только показать
//   npx tsx prisma/repair-stuck-final.ts                # починить всё найденное
//   npx tsx prisma/repair-stuck-final.ts <roundId>      # конкретный раунд
import { prisma } from "@/lib/prisma";
import { maybeFinalizeFinalAfterScoreInTx, getFinalScoringProgress } from "@/server/judging/final-advancement";
import { writeAudit } from "@/server/audit/audit";
import type { Actor } from "@/server/rbac/actor";
import type { Permission } from "@/server/rbac/permissions";

const REPAIR_ACTOR_EMAIL = "admin@bachata.by";

async function buildActor(): Promise<Actor> {
  const user = await prisma.user.findFirstOrThrow({ where: { email: REPAIR_ACTOR_EMAIL }, select: { id: true, email: true } });
  const superAdmin = await prisma.role.findFirst({
    where: { code: "SUPER_ADMIN" },
    include: { permissions: { include: { permission: true } } },
  });
  const globalPermissions = new Set<Permission>((superAdmin?.permissions ?? []).map((rp) => rp.permission.code as Permission));
  return { userId: user.id, email: user.email, globalPermissions, permissionsByCompetition: new Map() };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const explicitRoundId = args.find((a) => !a.startsWith("--"));

  const candidates = await prisma.round.findMany({
    where: explicitRoundId
      ? { id: explicitRoundId }
      : { status: "SCORING", finalSession: { isNot: null }, finalResults: { none: {} } },
    select: {
      id: true,
      status: true,
      order: true,
      finalSession: { select: { id: true, format: true } },
      stage: { select: { name: true } },
      division: { select: { category: { select: { name: true } }, competition: { select: { name: true } } } },
      _count: { select: { finalResults: true } },
    },
    orderBy: { order: "asc" },
  });

  if (candidates.length === 0) {
    console.log("Зависших финалов не найдено.");
    return;
  }

  for (const round of candidates) {
    const label = `«${round.stage?.name ?? "финал"}» / ${round.division.category.name} / ${round.division.competition.name}`;
    if (!round.finalSession) {
      console.log(`\n${label}\n  → пропускаю: это не критериальный финал (нет FinalSession)`);
      continue;
    }
    const progress = await getFinalScoringProgress(round.id);
    console.log(
      `\n${label} (${round.finalSession.format})\n  id=${round.id} статус=${round.status} результатов=${round._count.finalResults} ` +
        `подтверждений: ${progress.submitted} из ${progress.required} (готов: ${progress.complete})`
    );

    if (round.status !== "SCORING") {
      console.log("  → пропускаю: раунд не в статусе SCORING");
      continue;
    }
    if (round._count.finalResults > 0) {
      console.log("  → пропускаю: результаты уже посчитаны");
      continue;
    }
    if (!progress.complete) {
      console.log("  → пропускаю: судейство действительно ещё не завершено — это не зависание");
      continue;
    }
    if (dryRun) {
      console.log("  → (dry-run) досчитал бы результаты финала и завершил раунд");
      continue;
    }

    const actor = await buildActor();
    await prisma.$transaction(async (tx) => {
      await writeAudit(tx, {
        actor,
        action: "round.repair_stuck_final_scoring",
        entityType: "Round",
        entityId: round.id,
        before: { status: round.status, finalResultsCount: round._count.finalResults },
        after: { scoringProgress: progress },
        reason:
          "Критериальный финал (JUDGES_DANCE) остался в SCORING: getFinalScoringProgressInTx до фикса читал JudgeRoundConfirmation, а confirmFinalJudgeHeatDone пишет JudgeHeatConfirmation — готовность не пересчитывалась ни разу. Досчитан вручную тем же (уже исправленным) сервисом, что и штатная автоматика.",
      });
      await maybeFinalizeFinalAfterScoreInTx(tx, round.id, actor);
    });

    const after = await prisma.round.findFirstOrThrow({
      where: { id: round.id },
      select: { status: true, _count: { select: { finalResults: true, tieBreakRounds: true } } },
    });
    console.log(
      `  → готово: статус ${round.status} → ${after.status}, строк результата ${after._count.finalResults}, перетанцовок создано ${after._count.tieBreakRounds}`
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
