// Регистрирует всех 90 участников из j260801-roster.ts в их реальные
// категории (Дебютанты/Начинающие/Любители/Продвинутые/Профессионалы) и
// сразу отмечает всех прошедшими check-in — чтобы можно было сразу перейти
// к жеребьёвке/раундам и сравнить ход соревнования с реальным.
//
// Требует, чтобы ДО запуска уже существовали:
//   1. Соревнование и аккаунты участников — npm run seed:j260801-reference
//   2. Категории (Division) этих 5 названий в этом соревновании — заводятся
//      вручную через UI (по явному решению пользователя, 2026-09-06:
//      категории система не создаёт сама).
//   3. Статус соревнования — "Регистрация открыта" (иначе Registration
//      создать нельзя, как и в обычном UI-потоке).
//
// Идемпотентно — уже зарегистрированных/зачекиненных пропускает, можно
// запускать повторно (например, после того как добавили категорию, которой
// не хватало).
// Запуск: npm run register:j260801-reference
import { PrismaClient, Prisma, type RegistrationRole } from "@prisma/client";
import { CATEGORIES, COMPETITION_SLUG, emailFor, type Person } from "./j260801-roster";

const prisma = new PrismaClient();

async function findDivisionId(competitionId: string, categoryNames: string[]): Promise<string> {
  const divisions = await prisma.division.findMany({
    where: { competitionId },
    include: { category: { select: { name: true } } },
  });
  for (const name of categoryNames) {
    const found = divisions.find((d) => d.category.name === name);
    if (found) return found.id;
  }
  const available = divisions.map((d) => d.category.name).join(", ") || "(категорий пока нет)";
  throw new Error(
    `Не найдена категория "${categoryNames[0]}" (или синонимы: ${categoryNames.slice(1).join(", ") || "нет"}) в этом соревновании. ` +
      `Сейчас в соревновании есть: ${available}. Создайте недостающую категорию в UI и запустите скрипт снова.`
  );
}

async function registerOne(params: {
  competitionId: string;
  divisionId: string;
  person: Person;
  role: RegistrationRole;
  adminId: string;
  competitorRoleId: string;
}): Promise<{ registrationId: string; created: boolean }> {
  const email = emailFor("j260801", params.person);
  const user = await prisma.user.findUnique({ where: { email }, include: { dancer: true } });
  if (!user || !user.dancer) {
    throw new Error(`Аккаунт "${email}" (${params.person.displayName}) не найден — сначала запустите npm run seed:j260801-reference.`);
  }

  const existing = await prisma.registration.findUnique({
    where: {
      competitionId_divisionId_dancerId: {
        competitionId: params.competitionId,
        divisionId: params.divisionId,
        dancerId: user.dancer.id,
      },
    },
  });
  if (existing) return { registrationId: existing.id, created: false };

  const registration = await prisma.registration.create({
    data: {
      competitionId: params.competitionId,
      divisionId: params.divisionId,
      dancerId: user.dancer.id,
      role: params.role,
      registeredById: params.adminId,
    },
  });

  await prisma.competitionMember.upsert({
    where: {
      competitionId_userId_roleId: {
        competitionId: params.competitionId,
        userId: user.id,
        roleId: params.competitorRoleId,
      },
    },
    update: {},
    create: {
      competitionId: params.competitionId,
      userId: user.id,
      roleId: params.competitorRoleId,
      addedById: params.adminId,
    },
  });

  return { registrationId: registration.id, created: true };
}

async function checkInOne(competitionId: string, registrationId: string, adminId: string, nextBibRef: { n: number }): Promise<boolean> {
  const existing = await prisma.checkIn.findUnique({ where: { registrationId } });
  if (existing) return false;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await prisma.checkIn.create({
        data: {
          registrationId,
          competitionId,
          status: "CHECKED_IN",
          bibNumber: String(nextBibRef.n),
          checkedInById: adminId,
        },
      });
      nextBibRef.n++;
      return true;
    } catch (e) {
      const isBibClash = e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
      if (!isBibClash) throw e;
      // Номер уже занят (остаток от прошлого частичного запуска) — пробуем следующий.
      nextBibRef.n++;
      if (nextBibRef.n > 100000) throw e; // защита от бесконечного цикла
    }
  }
}

async function main() {
  const competition = await prisma.competition.findUnique({ where: { slug: COMPETITION_SLUG } });
  if (!competition) {
    throw new Error(`Соревнование "${COMPETITION_SLUG}" не найдено — сначала запустите npm run seed:j260801-reference.`);
  }
  if (competition.status !== "REGISTRATION_OPEN") {
    throw new Error(`Соревнование сейчас в статусе "${competition.status}", а не "Регистрация открыта" — регистрация невозможна.`);
  }
  const admin = await prisma.user.findUnique({ where: { email: "layer3-admin@bachata.by" } });
  if (!admin) throw new Error('Не найден администратор "layer3-admin@bachata.by".');
  const competitorRole = await prisma.role.findUniqueOrThrow({ where: { code: "COMPETITOR" } });

  let registeredCount = 0;
  let alreadyRegisteredCount = 0;
  let checkedInCount = 0;
  let alreadyCheckedInCount = 0;

  const nextBibRef = { n: (await prisma.checkIn.count({ where: { competitionId: competition.id } })) + 1 };

  for (const category of CATEGORIES) {
    const divisionId = await findDivisionId(competition.id, category.categoryNames);
    const entries: { person: Person; role: RegistrationRole }[] = [
      ...category.leaders.map((person) => ({ person, role: "LEADER" as const })),
      ...category.followers.map((person) => ({ person, role: "FOLLOWER" as const })),
    ];

    for (const { person, role } of entries) {
      const { registrationId, created } = await registerOne({
        competitionId: competition.id,
        divisionId,
        person,
        role,
        adminId: admin.id,
        competitorRoleId: competitorRole.id,
      });
      if (created) registeredCount++;
      else alreadyRegisteredCount++;

      const checkedIn = await checkInOne(competition.id, registrationId, admin.id, nextBibRef);
      if (checkedIn) checkedInCount++;
      else alreadyCheckedInCount++;
    }

    console.log(`${category.categoryNames[0]}: ${category.leaders.length} М, ${category.followers.length} Ж — готово.`);
  }

  console.log(
    `\nЗарегистрировано новых: ${registeredCount} (уже было: ${alreadyRegisteredCount}). ` +
      `Check-in выполнен: ${checkedInCount} (уже было: ${alreadyCheckedInCount}).`
  );
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
