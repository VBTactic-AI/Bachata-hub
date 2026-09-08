// Разблокировка раунда, зависшего в SCORING при 100% собранных оценок.
//
// Зачем нужен отдельный скрипт: готовность раунда пересчитывается только по
// событию (пришла оценка / судья нажал "Готово" / раунд вошёл в SCORING).
// Если раунд стал готов БЕЗ такого события — например, организатор снял
// лишнего судью и знаменатель "собрано X из N" уменьшился (реальный случай
// 2026-09-08) — пересчитывать его больше нечему, и он остаётся в SCORING
// навсегда, блокируя следующий раунд дивизиона (правило "раунды по очереди").
//
// Обе дыры закрыты в коде (maybeCalculateOnEntryInTx теперь срабатывает по
// progress.complete, а setDivisionJudges перепроверяет идущие раунды после
// снятия судьи), но уже зависшие раунды нужно досчитать один раз вручную —
// именно этим и занимается скрипт. Он НЕ правит статусы напрямую: вызывает
// ту же боевую функцию maybeFinalizeAfterScoreInTx, что и обычный путь, то
// есть результат и audit получаются такими же, как если бы автоматика
// сработала вовремя. Дополнительно пишет отдельную audit-запись о том, что
// это была ручная починка (CLAUDE.md §28-29 — никаких молчаливых правок).
//
// Запуск:
//   npx tsx prisma/repair-stuck-round.ts --dry-run      # только показать
//   npx tsx prisma/repair-stuck-round.ts                # починить всё найденное
//   npx tsx prisma/repair-stuck-round.ts <roundId>      # конкретный раунд
import { prisma } from "@/lib/prisma";
import { maybeFinalizeAfterScoreInTx, getRoundScoringProgress } from "@/server/judging/advancement";
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
      : { status: "SCORING", type: null, results: { none: {} } },
    select: {
      id: true,
      status: true,
      order: true,
      finalistsCount: true,
      // Финал с критериальным судейством (Этап 9) считается ДРУГИМ движком
      // (calculateFinalResultsInTx / FinalResult), и его готовность — тоже
      // другая функция. Такие раунды этот скрипт не трогает: вызов старого
      // пути посчитал бы им пустой RoundResult вместо настоящих мест.
      finalSession: { select: { id: true, format: true } },
      stage: { select: { name: true } },
      division: { select: { category: { select: { name: true } }, competition: { select: { name: true } } } },
      _count: { select: { results: true } },
    },
    orderBy: { order: "asc" },
  });

  if (candidates.length === 0) {
    console.log("Зависших раундов не найдено.");
    return;
  }

  for (const round of candidates) {
    const label = `«${round.stage?.name ?? "служебный"}» / ${round.division.category.name} / ${round.division.competition.name}`;
    const progress = await getRoundScoringProgress(round.id);
    console.log(
      `\n${label}\n  id=${round.id} статус=${round.status} результатов=${round._count.results} ` +
        `оценки: ${progress.submitted} из ${progress.required} (готов: ${progress.complete})`
    );

    if (round.status !== "SCORING") {
      console.log("  → пропускаю: раунд не в статусе SCORING");
      continue;
    }
    if (round.finalSession) {
      console.log(`  → пропускаю: критериальный финал (${round.finalSession.format}) — у него свой движок подсчёта`);
      continue;
    }
    if (round._count.results > 0) {
      console.log("  → пропускаю: результаты уже посчитаны");
      continue;
    }
    if (!progress.complete) {
      console.log("  → пропускаю: судейство действительно ещё не завершено — это не зависание");
      continue;
    }
    if (dryRun) {
      console.log("  → (dry-run) досчитал бы результаты и завершил раунд");
      continue;
    }

    const actor = await buildActor();
    await prisma.$transaction(async (tx) => {
      await writeAudit(tx, {
        actor,
        action: "round.repair_stuck_scoring",
        entityType: "Round",
        entityId: round.id,
        before: { status: round.status, resultsCount: round._count.results },
        after: { scoringProgress: progress },
        reason:
          "Раунд остался в SCORING при полностью собранных оценках: готовность не была перепроверена после изменения состава судей. Досчитан вручную тем же сервисом, что и штатная автоматика.",
      });
      await maybeFinalizeAfterScoreInTx(tx, round.id, actor);
    });

    const after = await prisma.round.findFirstOrThrow({
      where: { id: round.id },
      select: { status: true, _count: { select: { results: true, tieBreakRounds: true } } },
    });
    console.log(
      `  → готово: статус ${round.status} → ${after.status}, строк результата ${after._count.results}, перетанцовок создано ${after._count.tieBreakRounds}`
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
