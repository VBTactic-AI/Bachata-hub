// Разовый скрипт по прямому запросу пользователя (2026-09-05): полностью
// сбросить тестовые соревнования и создать одно новое, "Final Test", с одним
// дивизионом и 30 участниками (15 ведущих + 15 ведомых), уже
// зарегистрированными и зачекиненными — готовая нагрузочная заготовка для
// продолжения Performance Diagnostic Mode (docs/PROGRESS.md).
//
// Offline-инструмент обслуживания, как и остальные prisma/*.ts скрипты
// (seed-judges.ts, reset-competition-history.ts) — без RBAC/audit, это не
// действие живого пользователя в приложении. Идемпотентным НЕ является
// (удаляет все соревнования безусловно) — запускать осознанно.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const ADMIN_EMAIL = "layer3-admin@bachata.by";
const CATEGORY_ID = "divcat_lyubiteli"; // "Любители"
const STAGE_PLAN = [
  { stageId: "roundstage_otborochny", participantCount: 15 },
  { stageId: "roundstage_chetvertfinal", participantCount: 8 },
  { stageId: "roundstage_final", participantCount: 4 },
];
const PAIR_COUNT = 15;
const DEMO_PASSWORD = "Demo12345!";

async function main() {
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL } });
  const category = await prisma.divisionCategory.findUniqueOrThrow({ where: { id: CATEGORY_ID } });
  const eventAdminRole = await prisma.role.findUniqueOrThrow({ where: { code: "EVENT_ADMIN" } });
  const competitorRole = await prisma.role.findUniqueOrThrow({ where: { code: "COMPETITOR" } });

  // Result -> Round и Round -> CompetitionRules — обе связи БЕЗ каскада
  // (см. тот же нюанс в reset-competition-history.ts) — удаляются явно в
  // правильном порядке до каскадного сноса Competition -> Division/Registration/CheckIn.
  await prisma.result.deleteMany({});
  await prisma.round.deleteMany({});
  const deleted = await prisma.competition.deleteMany({});
  console.log(`Удалено соревнований: ${deleted.count} (каскадом — дивизионы/регистрации/чек-ины).`);

  const competition = await prisma.competition.create({
    data: {
      name: "Final Test",
      slug: "final-test",
      status: "REGISTRATION_OPEN",
      createdById: admin.id,
    },
  });

  await prisma.competitionMember.create({
    data: { competitionId: competition.id, userId: admin.id, roleId: eventAdminRole.id, addedById: admin.id },
  });

  const division = await prisma.division.create({
    data: { competitionId: competition.id, categoryId: category.id, heatCapacity: 10, rules: {} },
  });

  await prisma.divisionStagePlan.createMany({
    data: STAGE_PLAN.map((s) => ({ divisionId: division.id, stageId: s.stageId, participantCount: s.participantCount })),
  });

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  let bib = 1;

  for (let i = 1; i <= PAIR_COUNT; i++) {
    for (const role of ["LEADER", "FOLLOWER"] as const) {
      const isLeader = role === "LEADER";
      const n = String(i).padStart(2, "0");
      const email = `final-test-${isLeader ? "leader" : "follower"}-${n}@bachata.by`;
      const displayName = `${isLeader ? "Ведущий" : "Ведомая"} ${i}`;

      const user = await prisma.user.create({ data: { email, passwordHash, role: "DANCER" } });
      const dancer = await prisma.dancer.create({
        data: { userId: user.id, displayName, gender: isLeader ? "MALE" : "FEMALE" },
      });
      const registration = await prisma.registration.create({
        data: { competitionId: competition.id, divisionId: division.id, dancerId: dancer.id, role, registeredById: admin.id },
      });
      await prisma.competitionMember.create({
        data: { competitionId: competition.id, userId: user.id, roleId: competitorRole.id, addedById: admin.id },
      });
      await prisma.checkIn.create({
        data: {
          registrationId: registration.id,
          competitionId: competition.id,
          status: "CHECKED_IN",
          bibNumber: String(bib++),
          checkedInById: admin.id,
        },
      });
    }
  }

  console.log(
    `Готово: "${competition.name}" (${competition.id}), дивизион "${category.name}" (${division.id}), ` +
      `${PAIR_COUNT} ведущих + ${PAIR_COUNT} ведомых — все зарегистрированы и зачекинены (bib 1-${bib - 1}). ` +
      `План по этапам: ${STAGE_PLAN.map((s) => s.stageId).join(" -> ")}.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
