// Тестовые данные по реальному конкурсу "Belarus Bachata Jack & Jill 2/4 2026"
// (вкладка J260801 общей таблицы результатов, разобрана вручную 2026-09-06) —
// чтобы пользователь мог провести аналогичное соревнование в системе и
// сравнить итоговые места с реальными.
//
// По явному решению пользователя (2026-09-06):
//   - категории (Division) НЕ создаются — организатор заводит их сам;
//   - участники заводятся как обычные аккаунты (User+Dancer), БЕЗ
//     Registration (для неё в любом случае нужна категория) — пользователь
//     сам регистрирует их в свои категории через "Найти существующего
//     участника по имени" (уже поддерживает поиск с маской *);
//   - судьи — туда же, обычные аккаунты; назначаются пользователем вручную
//     через "Найти судью по имени" (JudgeSearchBox, добавлено этой же сессией).
// Пол выставлен как в реальных данных (М/Ж) — это только подсказка роли по
// умолчанию (D8), не жёсткое правило.
//
// НЕ все имена этой сборной таблицы удалось прочитать с одинаковой
// уверенностью (см. пометки "приблизительно" ниже, категории Начинающие-Ж,
// Любители, Продвинутые-Ж) — сколько-то строк заполнено условными именами в
// стиле уже существующих демо-данных ("Ведущий N"), чтобы совпадало общее
// число участников категории. Дебютанты, Начинающие-М, Профессионалы —
// прочитаны полностью и уверенно.
//
// Идемпотентно (upsert по email) — можно запускать повторно.
// Запуск: npm run seed:j260801-reference

import { PrismaClient, type Gender } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const DEMO_PASSWORD = "Demo12345!";

const CYRILLIC_MAP: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch",
  ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .split("")
    .map((ch) => CYRILLIC_MAP[ch] ?? ch)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

type Person = { displayName: string; gender: Gender };

// --- Участники по категориям (Дебютанты/Начинающие-М/Профессионалы —
// прочитаны уверенно; остальное — где отмечено, частично приблизительно) ---

const DEBUTANTS_M: Person[] = [
  "Фёдоров Александр", "Денисевич Николай", "Жулаев Али", "Зеленковский Сергей",
  "Хлебко Дмитрий", "Дедохевич Сергей", "Енджейчик Артём",
].map((displayName) => ({ displayName, gender: "MALE" as const }));

const DEBUTANTS_F: Person[] = [
  "Харитонович Анастасия", "Зеленко Екатерина", "Мозжина Анна", "Коробова Анастасия",
  "Кондратович Ангелина", "Коряжно Светлана", "Сысьявич Надежда", "Кудряшова Юлия",
  "Борисова Любовь", "Нупрейкин Анна", "Хлебко Дарья", "Данилина Юлия", "Ковалевская Алла",
].map((displayName) => ({ displayName, gender: "FEMALE" as const }));

const NOVICE_M: Person[] = [
  "Снитко Виталий", "Михолап Александр", "Нагорнов Алексей", "Казак Виктор",
  "Иванов Владимир", "Ласминский Евгений", "Глазунов Дмитрий",
].map((displayName) => ({ displayName, gender: "MALE" as const }));

// Приблизительно: 16 из 17 имён прочитаны, 17-е — условное.
const NOVICE_F: Person[] = [
  "Степаненко Анна", "Слободич Светлана", "Корнякова Виктория", "Садчикова Оксана",
  "Протасевич Светлана", "Ковальчук Татьяна", "Щербак Кристина", "Дядюшко Любовь",
  "Капитурко Мария", "Никифорова Валентина", "Козеня Мария", "Кравченко Ольга",
  "Ворон Алеся", "Тихановская Дарья", "Филинчик Мария", "Зубрицкая Мария",
  "Начинающие Ведомая 17",
].map((displayName) => ({ displayName, gender: "FEMALE" as const }));

// Приблизительно: 4 из 7 прочитаны, 3 — условные.
const AMATEUR_M: Person[] = [
  "Любители Ведущий 1", "Любители Ведущий 2", "Любители Ведущий 3",
  "Почебут Олег", "Изотов Константин", "Гайдук Сергей", "Гурин Павел",
].map((displayName) => ({ displayName, gender: "MALE" as const }));

// Приблизительно: 7 из 9 прочитаны, 2 — условные.
const AMATEUR_F: Person[] = [
  "Анисимова Елена", "Кошан Ольга", "Зайцева Наталья", "Бригадная Мария",
  "Азарова Анастасия", "Кузьмич Маргарита", "Петрова Наталья",
  "Любители Ведомая 8", "Любители Ведомая 9",
].map((displayName) => ({ displayName, gender: "FEMALE" as const }));

const ADVANCED_M: Person[] = [
  "Тройчук Кирилл", "Кофман Александр", "Пятышкин Игорь", "Малашевич Виталий",
  "Кремез Егор", "Ходонович Валерий", "Косик Иван", "ADESEMUYI BLESSING", "Бачак Игорь",
].map((displayName) => ({ displayName, gender: "MALE" as const }));

// Приблизительно: 3 из 8 прочитаны, 5 — условные.
const ADVANCED_F: Person[] = [
  "Продвинутые Ведомая 1", "Продвинутые Ведомая 2", "Продвинутые Ведомая 3",
  "Продвинутые Ведомая 4", "Продвинутые Ведомая 5",
  "Станковская Анна", "Кромез Кристина", "Бахурина Алина",
].map((displayName) => ({ displayName, gender: "FEMALE" as const }));

const PRO_M: Person[] = [
  "Губарь Егор", "Турукин Михаил", "Ратевский Илья", "Буйновский Евгений",
  "Костенчик Антон", "Юревич Сергей", "Тихонович Александр",
].map((displayName) => ({ displayName, gender: "MALE" as const }));

const PRO_F: Person[] = [
  "Демчук Ирина", "Поланевич Алина", "Саврид Виктория", "Маршина Анастасия",
  "Бусленко Анна", "Тишко Мария",
].map((displayName) => ({ displayName, gender: "FEMALE" as const }));

const ALL_COMPETITORS: Person[] = [
  ...DEBUTANTS_M, ...DEBUTANTS_F,
  ...NOVICE_M, ...NOVICE_F,
  ...AMATEUR_M, ...AMATEUR_F,
  ...ADVANCED_M, ...ADVANCED_F,
  ...PRO_M, ...PRO_F,
];

// --- Судьи (мужская и женская панели — разные люди, D6/A6: судьи назначаются по полу) ---

const JUDGES: Person[] = [
  { displayName: "Валейн Иван", gender: "MALE" },
  { displayName: "Шибалович Иван", gender: "MALE" },
  { displayName: "Вайтуль Дмитрий", gender: "MALE" },
  { displayName: "Ханалыев Тимур", gender: "MALE" },
  { displayName: "Джи Кларк", gender: "MALE" },
  { displayName: "Юревич Сергей", gender: "MALE" },
  { displayName: "Чирова Александра", gender: "FEMALE" },
  { displayName: "Сойчик Анастасия", gender: "FEMALE" },
  { displayName: "Мусиякина Дарья", gender: "FEMALE" },
  { displayName: "Романчук Ксения", gender: "FEMALE" },
  { displayName: "Лепейко Вероника", gender: "FEMALE" },
  { displayName: "Демчук Ирина", gender: "FEMALE" }, // тот же человек, что и в Профессионалах-Ж (совпадение реальных данных — намеренно один аккаунт)
  { displayName: "Поланевич Алина", gender: "FEMALE" }, // аналогично
];

async function upsertPerson(passwordHash: string, p: Person, emailPrefix: string): Promise<void> {
  const email = `${emailPrefix}-${slugifyName(p.displayName)}@bachata.by`;
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

  const slug = "j260801-test-reference";
  const competition = await prisma.competition.upsert({
    where: { slug },
    update: {},
    create: {
      name: "Belarus Bachata J&J 260801 — тестовая копия для сравнения",
      slug,
      description:
        "Тестовое соревнование для сравнения с реальными результатами Belarus Bachata Jack & Jill 2/4 2026 (вкладка J260801). Категории и регистрации — заводятся вручную.",
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
  console.log(`Пароль у всех — ${DEMO_PASSWORD}. Категории/регистрации/назначение судей — вручную через UI (поиск по имени с маской * уже работает).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
