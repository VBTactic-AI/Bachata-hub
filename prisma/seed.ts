import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

// Демо-пароль для ВСЕХ сидированных аккаунтов (см. README). Хешируется один
// раз и переиспользуется — это тестовые данные, не продакшн-пользователи.
const DEMO_PASSWORD = "Demo12345!";

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function atTime(date: Date, hours: number, minutes = 0): Date {
  const d = new Date(date);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

function pick<T>(arr: readonly T[], i: number): T {
  return arr[i % arr.length];
}

// --- имена для генерации ~28 демо-танцоров -------------------------------
const FEMALE_FIRST = [
  "Мария", "Анна", "Ольга", "Екатерина", "Дарья", "Полина", "Виктория",
  "Анастасия", "Ирина", "Наталья", "Елена", "Юлия", "Кристина", "Алина",
];
const MALE_FIRST = [
  "Алексей", "Дмитрий", "Андрей", "Сергей", "Максим", "Артём", "Игорь",
  "Павел", "Никита", "Владимир", "Кирилл", "Роман", "Евгений", "Денис",
];
const SURNAME_ROOTS = [
  "Иванов", "Смирнов", "Кузнецов", "Соколов", "Попов", "Лебедев", "Козлов",
  "Новиков", "Морозов", "Петров", "Волков", "Соловьёв", "Васильев", "Зайцев",
];

function femaleName(i: number) {
  const first = pick(FEMALE_FIRST, i);
  const last = `${pick(SURNAME_ROOTS, i)}а`;
  return `${first} ${last}`;
}
function maleName(i: number) {
  const first = pick(MALE_FIRST, i);
  const last = pick(SURNAME_ROOTS, i);
  return `${first} ${last}`;
}

export async function main(prisma: PrismaClient) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const now = new Date();

  // --- справочники ---------------------------------------------------
  const belarus = await prisma.country.upsert({
    where: { code: "BY" },
    update: {},
    create: { code: "BY", nameRu: "Беларусь" },
  });

  const cityDefs = [
    { slug: "minsk", nameRu: "Минск" },
    { slug: "gomel", nameRu: "Гомель" },
    { slug: "grodno", nameRu: "Гродно" },
    { slug: "brest", nameRu: "Брест" },
    { slug: "vitebsk", nameRu: "Витебск" },
    { slug: "mogilev", nameRu: "Могилёв" },
  ];
  const cities: Record<string, { id: string; slug: string; nameRu: string }> = {};
  for (const c of cityDefs) {
    cities[c.slug] = await prisma.city.upsert({
      where: { slug: c.slug },
      update: {},
      create: { ...c, countryId: belarus.id },
    });
  }

  // --- служебные аккаунты (без профиля танцора — это не участники сцены) --
  await prisma.user.upsert({
    where: { email: "admin@bachata.by" },
    update: {},
    create: { email: "admin@bachata.by", passwordHash, role: "ADMIN" },
  });
  await prisma.user.upsert({
    where: { email: "moderator@bachata.by" },
    update: {},
    create: { email: "moderator@bachata.by", passwordHash, role: "MODERATOR" },
  });
  const moderator = await prisma.user.findUniqueOrThrow({ where: { email: "moderator@bachata.by" } });

  // Минимальная структурная форма, которой достаточно для всего, что мы
  // делаем ниже с пользователями-танцорами (обходит неудобный синтаксис
  // `typeof arr[number]` для получения типа элемента массива).
  type DancerUser = { id: string; dancer: { id: string } | null };

  // --- представители школ (владеют карточками) + один "без школы" для демо заявки ---
  const schoolRepEmails = [
    "school1@bachata.by",
    "school2@bachata.by",
    "school3@bachata.by",
    "school4@bachata.by",
    "school5@bachata.by",
    "school6-unclaimed@bachata.by", // подаёт заявку на чужую школу — демо очереди модерации
  ];
  const schoolReps: DancerUser[] = [];
  for (let i = 0; i < schoolRepEmails.length; i++) {
    const user = await prisma.user.upsert({
      where: { email: schoolRepEmails[i] },
      update: {},
      create: {
        email: schoolRepEmails[i],
        passwordHash,
        role: "SCHOOL_REP",
        dancer: {
          create: {
            displayName: i % 2 === 0 ? maleName(i + 20) : femaleName(i + 20),
            cityId: cities.minsk.id,
          },
        },
      },
      include: { dancer: true },
    });
    schoolReps.push(user);
  }

  // --- организаторы без школы ------------------------------------------
  const organizerEmails = ["organizer1@bachata.by", "organizer2@bachata.by"];
  const organizers: DancerUser[] = [];
  for (let i = 0; i < organizerEmails.length; i++) {
    const user = await prisma.user.upsert({
      where: { email: organizerEmails[i] },
      update: {},
      create: {
        email: organizerEmails[i],
        passwordHash,
        role: "ORGANIZER",
        dancer: {
          create: { displayName: maleName(i + 30), cityId: cities.minsk.id },
        },
      },
      include: { dancer: true },
    });
    organizers.push(user);
  }

  // --- обычные танцоры (в сумме с представителями школ и организаторами --
  //     получается 28 профилей танцоров, как требует ТЗ) ------------------
  const PLAIN_DANCER_COUNT = 20;
  const dancerCityOrder = ["minsk", "minsk", "minsk", "minsk", "gomel", "grodno", "brest", "vitebsk"];
  const roles = ["LEADER", "FOLLOWER", "BOTH"] as const;
  const levels = ["BEGINNER", "ALL_LEVELS", "ADVANCED"] as const;
  const dancers: DancerUser[] = [];
  for (let i = 0; i < PLAIN_DANCER_COUNT; i++) {
    const isFemale = i % 2 === 0;
    const email = `dancer${String(i + 1).padStart(2, "0")}@bachata.by`;
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        passwordHash,
        role: "DANCER",
        dancer: {
          create: {
            displayName: isFemale ? femaleName(i) : maleName(i),
            cityId: cities[pick(dancerCityOrder, i)].id,
            danceRole: pick(roles, i),
            selfLevel: pick(levels, i),
          },
        },
      },
      include: { dancer: true },
    });
    dancers.push(user);
  }

  const allDancerUsers = [...schoolReps, ...organizers, ...dancers];

  // --- школы -------------------------------------------------------------
  const schoolDefs = [
    {
      slug: "bachata-sensual-minsk",
      name: "Bachata Sensual Minsk",
      owner: schoolReps[0],
      verified: true,
      description: "Студия сенсуальной бачаты в центре Минска — от новичков до продвинутых.",
      directions: ["Бачата", "Бачата Сенсуаль"],
      levelsList: ["BEGINNER", "ALL_LEVELS", "ADVANCED"] as const,
      phone: "+375 29 100-00-01",
      address: "ул. Немига, 5, Минск",
      teachers: [
        { name: "Максим Орлов", bio: "Преподаёт бачату с 2016 года, финалист республиканских конкурсов." },
        { name: "Виктория Ким", bio: "Хореограф, специализация — женский стиль и сенсуальная бачата." },
      ],
    },
    {
      slug: "latin-vibe-studio",
      name: "Latin Vibe Studio",
      owner: schoolReps[1],
      verified: true,
      description: "Школа латиноамериканских танцев: бачата, сальса, кизомба.",
      directions: ["Бачата", "Сальса", "Кизомба"],
      levelsList: ["BEGINNER", "ALL_LEVELS"] as const,
      phone: "+375 29 100-00-02",
      address: "пр. Победителей, 65, Минск",
      teachers: [{ name: "Артём Гурский", bio: "Преподаватель сальсы и бачаты, опыт 7 лет." }],
    },
    {
      slug: "dance-family",
      name: "Dance Family",
      owner: schoolReps[2],
      verified: true,
      description: "Семейная танцевальная студия — уютная атмосфера и внимание к каждому.",
      directions: ["Бачата"],
      levelsList: ["BEGINNER", "ALL_LEVELS", "ADVANCED"] as const,
      phone: "+375 29 100-00-03",
      address: "ул. Сурганова, 42, Минск",
      teachers: [
        { name: "Дарья Ковалёва", bio: "Преподаёт бачату и стретчинг для танцоров." },
        { name: "Никита Быков", bio: "Партнёр-хореограф, ставит showcase-номера." },
      ],
    },
    {
      slug: "bachata-moderna",
      name: "Bachata Moderna",
      owner: null,
      verified: false,
      description: "Молодая школа современной бачаты для тех, кто хочет двигаться свободно.",
      directions: ["Бачата"],
      levelsList: ["ALL_LEVELS"] as const,
      phone: null,
      address: "ул. Кальварийская, 11, Минск",
      teachers: [{ name: "Роман Есин", bio: "Преподаёт бачату модерна и уличные стили." }],
    },
    {
      slug: "ritmo-latino",
      name: "Ritmo Latino",
      owner: null,
      verified: false,
      description: "Клуб любителей латиноамериканских танцев — регулярные вечеринки и открытые уроки.",
      directions: ["Бачата", "Сальса"],
      levelsList: ["BEGINNER", "ALL_LEVELS"] as const,
      phone: "+375 29 100-00-05",
      address: "ул. Октябрьская, 16, Минск",
      teachers: [{ name: "Полина Реут", bio: "Организатор клуба, преподаёт бачату 4 года." }],
    },
  ];

  const schools: Record<string, Awaited<ReturnType<typeof prisma.school.create>>> = {};
  const weekdayCycle = ["MON", "WED", "FRI", "TUE", "THU"] as const;

  for (let si = 0; si < schoolDefs.length; si++) {
    const def = schoolDefs[si];
    const school = await prisma.school.upsert({
      where: { slug: def.slug },
      update: {},
      create: {
        slug: def.slug,
        name: def.name,
        cityId: cities.minsk.id,
        description: def.description,
        directions: [...def.directions],
        levels: [...def.levelsList],
        contactPhone: def.phone ?? undefined,
        contactEmail: `info@${def.slug.replace(/-/g, "")}.by`,
        socialLinks: { instagram: `https://instagram.com/${def.slug}` },
        verificationStatus: def.verified ? "VERIFIED" : "COMMUNITY",
        ownerUserId: def.owner ? def.owner.id : undefined,
        branches: { create: [{ address: def.address, cityId: cities.minsk.id }] },
        teachers: { create: def.teachers.map((t) => ({ name: t.name, bio: t.bio })) },
      },
      include: { teachers: true },
    });
    schools[def.slug] = school;

    // Расписание не имеет своего уникального ключа для upsert — пересоздаём
    // его целиком при каждом запуске сида, чтобы повторный `npm run seed`
    // не плодил дубли (не влияет на seed-if-empty.ts: там main() и так
    // выполняется только один раз, на пустой базе).
    await prisma.classSchedule.deleteMany({ where: { schoolId: school.id } });

    // расписание: каждому преподавателю школы — 1-2 группы в неделю
    for (let ti = 0; ti < school.teachers.length; ti++) {
      const teacher = school.teachers[ti];
      await prisma.classSchedule.create({
        data: {
          schoolId: school.id,
          teacherId: teacher.id,
          weekday: pick(weekdayCycle, si + ti),
          startTime: ti % 2 === 0 ? "19:00" : "20:30",
          endTime: ti % 2 === 0 ? "20:00" : "21:30",
          level: pick(def.levelsList, ti),
          hall: `Зал ${ti + 1}`,
        },
      });
    }
  }

  // --- заявка на владение школой (демо очереди модерации) ----------------
  await prisma.schoolClaim.upsert({
    where: { id: "seed-claim-1" },
    update: {},
    create: {
      id: "seed-claim-1",
      schoolId: schools["bachata-moderna"].id,
      claimantId: schoolReps[5].id, // school6-unclaimed@bachata.by
      status: "PENDING",
      proofNote: "Я один из основателей школы, могу подтвердить через Instagram-аккаунт студии.",
    },
  });

  // --- события -------------------------------------------------------
  type EventDef = {
    slug: string;
    title: string;
    citySlug: string;
    schoolSlug?: string;
    organizerName?: string;
    format: "PARTY" | "MASTERCLASS" | "FESTIVAL" | "CONTEST" | "INTENSIVE";
    level: "BEGINNER" | "ALL_LEVELS" | "ADVANCED";
    daysFromNow: number;
    hour: number;
    venueName: string;
    venueAddress?: string;
    priceText?: string;
    externalLinkUrl?: string;
    tags: string[];
    moderationStatus?: "PENDING" | "APPROVED";
    isArchived?: boolean;
  };

  const upcoming: EventDef[] = [
    { slug: "bachata-party-minsk-1", title: "Bachata Party в Bachata Sensual Minsk", citySlug: "minsk", schoolSlug: "bachata-sensual-minsk", format: "PARTY", level: "ALL_LEVELS", daysFromNow: 3, hour: 20, venueName: "Bachata Sensual Minsk", priceText: "15 BYN", tags: ["вечеринка", "сенсуал"] },
    { slug: "mk-sensual-osnovy", title: "Мастер-класс: основы сенсуальной бачаты", citySlug: "minsk", schoolSlug: "bachata-sensual-minsk", format: "MASTERCLASS", level: "BEGINNER", daysFromNow: 5, hour: 19, venueName: "Bachata Sensual Minsk", priceText: "20 BYN", tags: ["мастер-класс"] },
    { slug: "salsa-bachata-mix-party", title: "Salsa & Bachata Mix Party", citySlug: "minsk", schoolSlug: "latin-vibe-studio", format: "PARTY", level: "ALL_LEVELS", daysFromNow: 7, hour: 20, venueName: "Latin Vibe Studio", priceText: "18 BYN", tags: ["вечеринка"] },
    { slug: "dance-family-open-lesson", title: "Открытое занятие Dance Family", citySlug: "minsk", schoolSlug: "dance-family", format: "MASTERCLASS", level: "BEGINNER", daysFromNow: 8, hour: 19, venueName: "Dance Family", priceText: "бесплатно", tags: ["новички"] },
    { slug: "bachata-moderna-vecherinka", title: "Вечеринка Bachata Moderna", citySlug: "minsk", schoolSlug: "bachata-moderna", format: "PARTY", level: "ALL_LEVELS", daysFromNow: 10, hour: 20, venueName: "Bachata Moderna", priceText: "12 BYN", tags: ["вечеринка"] },
    { slug: "ritmo-latino-club-night", title: "Ritmo Latino Club Night", citySlug: "minsk", schoolSlug: "ritmo-latino", format: "PARTY", level: "ALL_LEVELS", daysFromNow: 12, hour: 21, venueName: "Ritmo Latino", priceText: "10 BYN", tags: ["вечеринка"] },
    { slug: "intensiv-vyhodnogo-dnya", title: "Воркшоп-интенсив выходного дня", citySlug: "minsk", schoolSlug: "bachata-sensual-minsk", format: "INTENSIVE", level: "ADVANCED", daysFromNow: 14, hour: 12, venueName: "Bachata Sensual Minsk", priceText: "60 BYN", tags: ["интенсив", "продвинутый"] },
    { slug: "gomel-bachata-vecher", title: "Бачата-вечер в Гомеле", citySlug: "gomel", organizerName: "Танцевальная студия «Пульс»", format: "PARTY", level: "ALL_LEVELS", daysFromNow: 9, hour: 19, venueName: "ДК «Пульс»", venueAddress: "ул. Советская, 30, Гомель", priceText: "10 BYN", tags: ["вечеринка", "гомель"] },
    { slug: "gomel-mk-nachinayuschim", title: "Мастер-класс для начинающих", citySlug: "gomel", organizerName: "Танцевальная студия «Пульс»", format: "MASTERCLASS", level: "BEGINNER", daysFromNow: 16, hour: 18, venueName: "ДК «Пульс»", priceText: "15 BYN", tags: ["новички"] },
    { slug: "grodno-latina-party", title: "Latina Party Гродно", citySlug: "grodno", organizerName: "Grodno Dance Community", format: "PARTY", level: "ALL_LEVELS", daysFromNow: 11, hour: 20, venueName: "Клуб «Ритм»", venueAddress: "ул. Советская, 8, Гродно", priceText: "12 BYN", tags: ["вечеринка"] },
    { slug: "grodno-festival-latina", title: "Фестиваль Grodno Latina Fest", citySlug: "grodno", organizerName: "Grodno Dance Community", format: "FESTIVAL", level: "ALL_LEVELS", daysFromNow: 45, hour: 12, venueName: "Дворец культуры", venueAddress: "пл. Ленина, 1, Гродно", priceText: "80 BYN", externalLinkUrl: "https://example.com/grodno-latina-fest", tags: ["фестиваль"] },
    { slug: "brest-bachata-open", title: "Brest Bachata Open Air", citySlug: "brest", organizerName: "Brest Latin Dance", format: "PARTY", level: "ALL_LEVELS", daysFromNow: 20, hour: 19, venueName: "Летняя веранда «Барка»", venueAddress: "ул. Гоголя, 3, Брест", priceText: "15 BYN", tags: ["вечеринка", "open-air"] },
    { slug: "brest-mk-styling", title: "Мастер-класс: женский стайлинг", citySlug: "brest", organizerName: "Brest Latin Dance", format: "MASTERCLASS", level: "ALL_LEVELS", daysFromNow: 25, hour: 19, venueName: "Студия танца", priceText: "18 BYN", tags: ["стайлинг"] },
    { slug: "vitebsk-bachata-vecherinka", title: "Бачата-вечеринка в Витебске", citySlug: "vitebsk", organizerName: "Vitebsk Dance Family", format: "PARTY", level: "ALL_LEVELS", daysFromNow: 18, hour: 19, venueName: "Арт-кафе «Гараж»", venueAddress: "ул. Ленина, 20, Витебск", priceText: "10 BYN", tags: ["вечеринка"] },
    { slug: "chempionat-jj-minsk", title: "Открытый конкурс Jack & Jill by Bachata HUB", citySlug: "minsk", organizerName: "Bachata HUB Беларусь", format: "CONTEST", level: "ALL_LEVELS", daysFromNow: 60, hour: 15, venueName: "Дворец культуры профсоюзов", venueAddress: "просп. Победителей, 4, Минск", priceText: "25 BYN (участник) / 15 BYN (гость)", externalLinkUrl: "https://example.com/jack-and-jill-minsk", tags: ["конкурс", "jack-and-jill"] },
    { slug: "bachata-sensual-2-party", title: "Bachata Sensual Night vol. 2", citySlug: "minsk", schoolSlug: "bachata-sensual-minsk", format: "PARTY", level: "ADVANCED", daysFromNow: 30, hour: 20, venueName: "Bachata Sensual Minsk", priceText: "15 BYN", tags: ["вечеринка", "сенсуал"] },
    { slug: "latin-vibe-intensiv", title: "Интенсив по мужской технике ведения", citySlug: "minsk", schoolSlug: "latin-vibe-studio", format: "INTENSIVE", level: "ADVANCED", daysFromNow: 33, hour: 12, venueName: "Latin Vibe Studio", priceText: "50 BYN", tags: ["интенсив"] },
    // две заявки специально оставлены непровеpенными — демонстрация очереди модерации
    { slug: "dance-family-newcomers-party", title: "Вечеринка для новых учеников", citySlug: "minsk", schoolSlug: "dance-family", format: "PARTY", level: "BEGINNER", daysFromNow: 15, hour: 19, venueName: "Dance Family", priceText: "бесплатно", tags: ["новички"], moderationStatus: "PENDING" },
    { slug: "gomel-solo-battle", title: "Solo Battle Gomel", citySlug: "gomel", organizerName: "Танцевальная студия «Пульс»", format: "CONTEST", level: "ALL_LEVELS", daysFromNow: 40, hour: 17, venueName: "ДК «Пульс»", priceText: "10 BYN", tags: ["конкурс", "solo-battle"], moderationStatus: "PENDING" },
  ];

  const archived: EventDef[] = [
    { slug: "bachata-party-minsk-past-1", title: "Bachata Party (август)", citySlug: "minsk", schoolSlug: "bachata-sensual-minsk", format: "PARTY", level: "ALL_LEVELS", daysFromNow: -25, hour: 20, venueName: "Bachata Sensual Minsk", priceText: "15 BYN", tags: ["вечеринка"], isArchived: true },
    { slug: "latin-vibe-past-party", title: "Salsa & Bachata Mix Party (июль)", citySlug: "minsk", schoolSlug: "latin-vibe-studio", format: "PARTY", level: "ALL_LEVELS", daysFromNow: -55, hour: 20, venueName: "Latin Vibe Studio", priceText: "15 BYN", tags: ["вечеринка"], isArchived: true },
    { slug: "dance-family-past-mk", title: "Мастер-класс по бачате (июнь)", citySlug: "minsk", schoolSlug: "dance-family", format: "MASTERCLASS", level: "BEGINNER", daysFromNow: -80, hour: 19, venueName: "Dance Family", priceText: "15 BYN", tags: ["мастер-класс"], isArchived: true },
    { slug: "jj-minsk-past-contest", title: "Jack & Jill Minsk Open (весна)", citySlug: "minsk", organizerName: "Bachata HUB Беларусь", format: "CONTEST", level: "ALL_LEVELS", daysFromNow: -70, hour: 15, venueName: "Дворец культуры профсоюзов", priceText: "20 BYN", tags: ["конкурс"], isArchived: true },
    { slug: "ritmo-latino-past-party", title: "Club Night (весна)", citySlug: "minsk", schoolSlug: "ritmo-latino", format: "PARTY", level: "ALL_LEVELS", daysFromNow: -40, hour: 21, venueName: "Ritmo Latino", priceText: "10 BYN", tags: ["вечеринка"], isArchived: true },
  ];

  const creatorPool = [...schoolReps, ...organizers];
  const createdEvents: Record<string, Awaited<ReturnType<typeof prisma.event.create>>> = {};

  // Event upsert'ится по slug (безопасно при повторном запуске), но записи
  // журнала модерации ниже — обычный create без уникального ключа, поэтому
  // сперва убираем те, что мог оставить предыдущий прогон сида.
  await prisma.moderationLog.deleteMany({
    where: { reason: "Seed: демо-данные предзагружены как проверенные" },
  });

  let eventIndex = 0;
  for (const def of [...upcoming, ...archived]) {
    const startsAt = atTime(addDays(now, def.daysFromNow), def.hour);
    const creator = def.schoolSlug
      ? schoolReps.find((r) => schools[def.schoolSlug!]?.ownerUserId === r.id) ?? pick(creatorPool, eventIndex)
      : pick(organizers, eventIndex);

    const event = await prisma.event.upsert({
      where: { slug: def.slug },
      update: {},
      create: {
        slug: def.slug,
        title: def.title,
        cityId: cities[def.citySlug].id,
        schoolId: def.schoolSlug ? schools[def.schoolSlug].id : undefined,
        organizerName: def.schoolSlug ? undefined : def.organizerName,
        format: def.format,
        eventType: def.format === "CONTEST" ? "CONTEST" : "REGULAR",
        level: def.level,
        startsAt,
        venueName: def.venueName,
        venueAddress: def.venueAddress,
        priceText: def.priceText,
        externalLinkUrl: def.externalLinkUrl,
        tags: def.tags,
        moderationStatus: def.moderationStatus ?? "APPROVED",
        isArchived: def.isArchived ?? false,
        createdById: creator.id,
        moderatedById: (def.moderationStatus ?? "APPROVED") === "APPROVED" ? moderator.id : undefined,
        moderatedAt: (def.moderationStatus ?? "APPROVED") === "APPROVED" ? now : undefined,
      },
    });
    createdEvents[def.slug] = event;

    if ((def.moderationStatus ?? "APPROVED") === "APPROVED") {
      await prisma.moderationLog.create({
        data: {
          actorId: moderator.id,
          entity: "EVENT",
          entityId: event.id,
          action: "approve",
          reason: "Seed: демо-данные предзагружены как проверенные",
        },
      });
    }
    eventIndex++;
  }

  // --- отзывы на школы -----------------------------------------------
  const reviewTexts = [
    "Отличные преподаватели, атмосфера очень тёплая. Хожу уже полгода!",
    "Понравилось всё, кроме расписания — хотелось бы больше групп по выходным.",
    "Лучшая школа бачаты в городе, рекомендую всем новичкам.",
    "Хороший уровень преподавания, но зал маловат для больших групп.",
    "Пришла случайно на открытое занятие и осталась — очень душевно.",
  ];
  // Review тоже создаётся без upsert (нет естественного уникального ключа
  // на автора+школу — один человек может честно оставить два отзыва) —
  // чистим сидовые отзывы наших демо-школ перед повторной вставкой.
  //
  // Отзыв публикуется только после проверки модератором (moderationStatus:
  // PENDING по умолчанию в схеме) — поэтому большинство сидовых отзывов
  // явно помечены как уже проверенные (APPROVED + moderatedById), иначе
  // страницы школ в демо были бы пустыми. Один отзыв на каждую школу
  // намеренно оставлен непроверенным — демонстрация очереди модерации и
  // того, что автор видит свой отзыв со статусом «на модерации» ещё до
  // публикации.
  await prisma.review.deleteMany({ where: { schoolId: { in: Object.values(schools).map((s) => s.id) } } });
  let reviewCounter = 0;
  for (const slug of Object.keys(schools)) {
    const count = slug === "bachata-moderna" ? 1 : 2;
    for (let i = 0; i < count; i++) {
      const author = pick(allDancerUsers, reviewCounter + i);
      const isPending = i === count - 1; // последний отзыв школы — в очереди на проверку
      const review = await prisma.review.create({
        data: {
          schoolId: schools[slug].id,
          authorId: author.id,
          rating: 4 + ((reviewCounter + i) % 2),
          text: pick(reviewTexts, reviewCounter + i),
          moderationStatus: isPending ? "PENDING" : "APPROVED",
          moderatedById: isPending ? undefined : moderator.id,
        },
      });

      if (!isPending) {
        await prisma.moderationLog.create({
          data: {
            actorId: moderator.id,
            entity: "REVIEW",
            entityId: review.id,
            action: "approve",
            reason: "Seed: демо-данные предзагружены как проверенные",
          },
        });
      }
    }
    reviewCounter += count;
  }

  // --- посещения: "иду" на будущие события, "был" на архивные -----------
  const upcomingSlugs = upcoming.map((e) => e.slug);
  const archivedSlugs = archived.map((e) => e.slug);

  for (let i = 0; i < allDancerUsers.length; i++) {
    const dancerUser = allDancerUsers[i];
    if (!dancerUser.dancer) continue;

    // 2-3 отметки "иду" на будущие события
    for (let k = 0; k < 3; k++) {
      const slug = pick(upcomingSlugs, i + k * 7);
      await prisma.attendance
        .upsert({
          where: { dancerId_eventId: { dancerId: dancerUser.dancer.id, eventId: createdEvents[slug].id } },
          update: {},
          create: {
            dancerId: dancerUser.dancer.id,
            eventId: createdEvents[slug].id,
            status: "GOING",
          },
        })
        .catch(() => null);
    }

    // 1-2 отметки "был" на прошедших событиях — формирует историю профиля
    for (let k = 0; k < 2; k++) {
      const slug = pick(archivedSlugs, i + k * 3);
      await prisma.attendance
        .upsert({
          where: { dancerId_eventId: { dancerId: dancerUser.dancer.id, eventId: createdEvents[slug].id } },
          update: {},
          create: {
            dancerId: dancerUser.dancer.id,
            eventId: createdEvents[slug].id,
            status: "WENT",
          },
        })
        .catch(() => null);
    }
  }

  // --- достижения (source: MANUAL — как и должно быть на этом слое) -----
  const achievementTexts = [
    "Вышел(-ла) в полуфинал Jack & Jill Minsk Open",
    "Приняла участие в первом городском Solo Battle",
    "Заняла 3-е место в номинации Newcomer",
    "Выступила в showcase на фестивале Grodno Latina Fest",
  ];
  const achieversIdx = [0, 3, 6, 9, 12];
  // Как и Review, Achievement создаётся без upsert — чистим сидовые записи
  // именно этих танцоров перед повторной вставкой.
  await prisma.achievement.deleteMany({
    where: {
      dancerId: {
        in: achieversIdx
          .map((idx) => allDancerUsers[idx]?.dancer?.id)
          .filter((id): id is string => !!id),
      },
    },
  });
  for (let i = 0; i < achieversIdx.length; i++) {
    const dancerUser = allDancerUsers[achieversIdx[i]];
    if (!dancerUser?.dancer) continue;
    await prisma.achievement.create({
      data: {
        dancerId: dancerUser.dancer.id,
        description: pick(achievementTexts, i),
        achievedAt: addDays(now, -70),
        source: "MANUAL",
        eventId: createdEvents["jj-minsk-past-contest"]?.id,
      },
    });
  }

  return {
    dancers: allDancerUsers.length,
    schools: Object.keys(schools).length,
    events: Object.keys(createdEvents).length,
  };
}

// Запуск напрямую: `npm run seed` / `npx tsx prisma/seed.ts`
if (require.main === module) {
  const prisma = new PrismaClient();
  main(prisma)
    .then((summary) => {
      console.log("Seed OK:", summary);
    })
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
