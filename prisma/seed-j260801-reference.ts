// Тестовые данные по реальному конкурсу "Belarus Bachata Jack & Jill 2/4 2026"
// (вкладка J260801 общей таблицы результатов) — чтобы пользователь мог
// провести аналогичное соревнование в системе и сравнить итоговые места с
// реальными. Список участников/судей — см. j260801-roster.ts.
//
// По явному решению пользователя (2026-09-06): категории (Division) НЕ
// создаются — организатор заводит их сам; участники/судьи заводятся как
// обычные аккаунты (User+Dancer), БЕЗ Registration (для неё нужна уже
// существующая категория — см. register-j260801-reference.ts, отдельный
// шаг после того, как категории созданы).
//
// Идемпотентно (upsert по email) — можно запускать повторно.
// Запуск: npm run seed:j260801-reference
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { ALL_COMPETITORS, JUDGES, COMPETITION_SLUG, DEMO_PASSWORD, emailFor, type Person } from "./j260801-roster";

const prisma = new PrismaClient();

async function upsertPerson(passwordHash: string, p: Person, emailPrefix: string): Promise<void> {
  const email = emailFor(emailPrefix, p);
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, passwordHash, role: "DANCER" },
  });
  await prisma.dancer.upsert({
    where: { userId: user.id },
    update: { displayName: p.displayName, gender: p.gender },
    create: { userId: user.id, displayName: p.displayName, gender: p.gender },
  });
}

async function main() {
  const admin = await prisma.user.findUnique({ where: { email: "layer3-admin@bachata.by" } });
  if (!admin) {
    throw new Error('Не найден администратор "layer3-admin@bachata.by" — нужен как createdById для новой Competition.');
  }

  const competition = await prisma.competition.upsert({
    where: { slug: COMPETITION_SLUG },
    update: {},
    create: {
      name: "Belarus Bachata J&J 260801 — тестовая копия для сравнения",
      slug: COMPETITION_SLUG,
      description:
        "Тестовое соревнование для сравнения с реальными результатами Belarus Bachata Jack & Jill 2/4 2026 (вкладка J260801). Категории — заводятся вручную.",
      organizerName: "Bachata Belarus",
      createdById: admin.id,
    },
  });

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  for (const p of ALL_COMPETITORS) {
    await upsertPerson(passwordHash, p, "j260801");
  }
  for (const j of JUDGES) {
    await upsertPerson(passwordHash, j, "j260801-judge");
  }

  console.log(`Соревнование: "${competition.name}" (slug: ${competition.slug}, id: ${competition.id}, статус: ${competition.status}).`);
  console.log(`Участников создано/обновлено: ${ALL_COMPETITORS.length} (М: ${ALL_COMPETITORS.filter((p) => p.gender === "MALE").length}, Ж: ${ALL_COMPETITORS.filter((p) => p.gender === "FEMALE").length}).`);
  console.log(`Судей создано/обновлено: ${JUDGES.length}.`);
  console.log(`Пароль у всех — ${DEMO_PASSWORD}. Дальше: создайте категории в UI, затем npm run register:j260801-reference (регистрация + check-in).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
