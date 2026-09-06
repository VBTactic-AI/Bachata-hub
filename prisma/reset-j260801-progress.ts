// Сбрасывает ХОД тестового соревнования J260801 — раунды, заходы,
// жеребьёвки, ротации, судейство, официальные результаты — чтобы можно
// было провести его заново с той же жеребьёвки. НЕ трогает Division
// (категории), Registration/CheckIn (участники остаются зарегистрированы и
// зачекинены — по явному решению пользователя, 2026-09-06) и
// FinalSettings/FinalCriterion (настройки формата финала — это конфигурация,
// не ход соревнования).
//
// В отличие от reset-competition-history.ts (глобальный, все соревнования) —
// этот скрипт трогает ТОЛЬКО соревнование j260801-test-reference, чтобы
// случайно не задеть другие тестовые/реальные соревнования в базе.
//
// Идемпотентно — если раундов уже нет, просто ничего не находит.
// Запуск: npm run reset:j260801-progress
// Предпросмотр без изменений: npm run reset:j260801-progress -- --dry-run
import { PrismaClient } from "@prisma/client";
import { COMPETITION_SLUG } from "./j260801-roster";

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");

async function main() {
  console.log(`=== Сбросить ход соревнования "${COMPETITION_SLUG}" ===`);
  console.log(dryRun ? "(режим предпросмотра — ничего не изменится)\n" : "");

  const competition = await prisma.competition.findUnique({ where: { slug: COMPETITION_SLUG } });
  if (!competition) {
    throw new Error(`Соревнование "${COMPETITION_SLUG}" не найдено.`);
  }

  const divisions = await prisma.division.findMany({ where: { competitionId: competition.id }, select: { id: true } });
  const divisionIds = divisions.map((d) => d.id);

  const [rounds, heats, draws, drawParticipants, heatRotations, roundResults, results] = await Promise.all([
    prisma.round.count({ where: { divisionId: { in: divisionIds } } }),
    prisma.heat.count({ where: { round: { divisionId: { in: divisionIds } } } }),
    prisma.draw.count({ where: { heat: { round: { divisionId: { in: divisionIds } } } } }),
    prisma.drawParticipant.count({ where: { draw: { heat: { round: { divisionId: { in: divisionIds } } } } } }),
    prisma.heatRotation.count({ where: { heat: { round: { divisionId: { in: divisionIds } } } } }),
    prisma.roundResult.count({ where: { round: { divisionId: { in: divisionIds } } } }),
    prisma.result.count({ where: { divisionId: { in: divisionIds } } }),
  ]);

  console.log(
    `Сейчас: категорий — ${divisionIds.length}, раундов — ${rounds}, заходов — ${heats}, жеребьёвок — ${draws}, ` +
      `участников жеребьёвки — ${drawParticipants}, ротаций — ${heatRotations}, промежуточных результатов раунда — ${roundResults}, ` +
      `официальных результатов — ${results}.`
  );
  console.log("Регистрации/check-in участников, настройки категорий/финала — НЕ трогаются.");

  if (dryRun) {
    console.log("\nDry-run: ничего не удалено.");
    return;
  }

  // Result ссылается на Round без каскада (Restrict) — удаляется первым.
  await prisma.result.deleteMany({ where: { divisionId: { in: divisionIds } } });
  await prisma.round.deleteMany({ where: { divisionId: { in: divisionIds } } });

  console.log(
    `\nГотово: удалено официальных результатов — ${results}, раундов — ${rounds} (каскадом ушли заходы/жеребьёвки/ротации/промежуточные результаты раунда/судейство финала).`
  );
  console.log("Можно заново генерировать раунды и проводить соревнование — участники уже зарегистрированы и зачекинены.");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
