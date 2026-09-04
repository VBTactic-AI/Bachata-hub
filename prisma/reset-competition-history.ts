// «Очистить историю соревнований» — повторно запускаемый инструмент для
// сброса тестовых данных между заходами ручного тестирования (по запросу
// пользователя, 2026-09-04). НЕ трогает Division/Registration/CheckIn —
// это подтверждено явно (см. docs/00_DECISIONS.md): удаление Division
// каскадом снесло бы все регистрации участников, это НЕ входит в задачу.
//
// Делает ровно два действия:
//   1. Удаляет все Round — каскадом (onDelete: Cascade в schema.prisma)
//      снимает Heat, Draw, DrawParticipant, HeatRotation, RoundResult.
//   2. Переводит статус ВСЕХ Competition на REGISTRATION_CLOSED — прямым
//      UPDATE, в обход обычной машины состояний (src/server/state/
//      competition-state.ts): та проверяет допустимость перехода из
//      ТЕКУЩЕГО статуса и не разрешает, например, DRAFT -> REGISTRATION_CLOSED
//      напрямую, а этому скрипту нужно жёстко привести любое соревнование
//      к одному статусу независимо от того, где оно сейчас. Аудит (AuditLog)
//      сознательно не пишется — это оффлайн-инструмент обслуживания, не
//      действие живого пользователя в приложении (тот же подход уже
//      применялся вручную в этом проекте при прошлых сбросах, см. PROGRESS.md).
//
// Запуск: npm run reset:competition-history
// Предпросмотр без изменений: npm run reset:competition-history -- --dry-run
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");

async function main() {
  console.log("=== Очистить историю соревнований ===");
  console.log(dryRun ? "(режим предпросмотра — ничего не изменится)\n" : "");

  const [rounds, heats, draws, drawParticipants, heatRotations, roundResults, competitions] = await Promise.all([
    prisma.round.count(),
    prisma.heat.count(),
    prisma.draw.count(),
    prisma.drawParticipant.count(),
    prisma.heatRotation.count(),
    prisma.roundResult.count(),
    prisma.competition.findMany({ select: { id: true, name: true, status: true } }),
  ]);

  console.log(
    `Сейчас в базе: раундов — ${rounds}, заходов — ${heats}, жеребьёвок — ${draws}, ` +
      `участников жеребьёвки — ${drawParticipants}, ротаций — ${heatRotations}, результатов — ${roundResults}.`
  );
  const toClose = competitions.filter((c) => c.status !== "REGISTRATION_CLOSED");
  console.log(`Соревнований всего: ${competitions.length}, не в статусе "Регистрация закрыта": ${toClose.length}.`);
  if (toClose.length > 0) {
    for (const c of toClose) console.log(`  - ${c.name} (сейчас: ${c.status})`);
  }

  if (dryRun) {
    console.log("\nDry-run: раунды/заходы удалены НЕ были, статусы НЕ менялись.");
    return;
  }

  await prisma.round.deleteMany({});
  const closed = await prisma.competition.updateMany({
    where: { status: { not: "REGISTRATION_CLOSED" } },
    data: { status: "REGISTRATION_CLOSED", statusVersion: { increment: 1 } },
  });

  console.log(`\nГотово: удалено раундов — ${rounds} (каскадом ушли заходы/жеребьёвки/ротации/результаты).`);
  console.log(`Переведено в "Регистрация закрыта": ${closed.count} соревнований.`);
  console.log("Division/Registration/CheckIn не тронуты.");
}

main()
  .catch((e) => {
    console.error("Ошибка:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
