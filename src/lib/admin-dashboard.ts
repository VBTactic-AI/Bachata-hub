import { prisma } from "./prisma";
import { activeEventFilter } from "./events";
import type { EventFormat, ModerationStatus, SchoolVerificationStatus } from "@prisma/client";

// Данные для вкладки "Главная" /admin (redesign, 2026-09-12, по запросу
// пользователя — "за 3 секунды понять, что происходит во всей системе").
// Все цифры — реальные агрегаты из БД, ничего не выдумано и не считается на
// клиенте (CLAUDE.md §19/§60): нет ни готовой аналитики посещений/трафика
// (в проекте не подключён ни один сервис веб-аналитики), ни квоты Supabase
// (это данные Management API, недоступные из самого приложения без отдельного
// секретного токена — архитектурное решение, которое пока не принято). Вместо
// выдуманных чисел — то, что реально можно проверить: размер БД через SQL и
// активность за 24 часа по собственным таблицам (AuditLog/User/Event).

export type GlobalOverview = {
  totalSchools: number;
  verifiedSchools: number;
  totalUsers: number;
  totalCompetitions: number;
  totalEvents: number;
};

export async function getGlobalOverview(): Promise<GlobalOverview> {
  const [totalSchools, verifiedSchools, totalUsers, totalCompetitions, totalEvents] = await Promise.all([
    prisma.school.count(),
    prisma.school.count({ where: { verificationStatus: "VERIFIED" } }),
    prisma.user.count(),
    prisma.competition.count(),
    prisma.event.count(),
  ]);
  return { totalSchools, verifiedSchools, totalUsers, totalCompetitions, totalEvents };
}

export type CityActivity = { id: string; name: string; eventsCount: number; schoolsCount: number };

// "Сеть активности" — абстрактная визуализация вместо географической карты
// (пользователь предложил оба варианта на выбор): по городу считаем реально
// предстоящие (не прошедшие, одобренные, не архивные) события и активные
// школы — то же определение "активного города", что уже использует
// getGrowthStats() в lib/moderation.ts, только с разбивкой по каждому городу
// вместо одного общего счётчика.
export async function getCityActivityNetwork(): Promise<CityActivity[]> {
  const now = new Date();
  const cities = await prisma.city.findMany({
    where: { isActive: true },
    orderBy: { nameRu: "asc" },
    include: {
      _count: {
        select: {
          events: { where: { ...activeEventFilter(), startsAt: { gte: now } } },
          schools: { where: { isActive: true } },
        },
      },
    },
  });
  return cities.map((c) => ({ id: c.id, name: c.nameRu, eventsCount: c._count.events, schoolsCount: c._count.schools }));
}

export type SchoolActivity = {
  id: string;
  slug: string;
  name: string;
  cityName: string;
  verificationStatus: SchoolVerificationStatus;
  isActive: boolean;
  upcomingEventsCount: number;
  pendingEventsCount: number;
};

// Топ школ по числу предстоящих событий — самая наглядная сортировка для
// "какая школа сейчас реально активна", без выдуманной метрики популярности
// (тот же принцип, что и у "Популярные школы" на главной, lib/events.ts).
export async function getTopActiveSchools(limit = 6): Promise<SchoolActivity[]> {
  const now = new Date();
  const upcomingGroups = await prisma.event.groupBy({
    by: ["schoolId"],
    where: { schoolId: { not: null }, ...activeEventFilter(), startsAt: { gte: now } },
    _count: { schoolId: true },
    orderBy: { _count: { schoolId: "desc" } },
    take: limit,
  });
  const schoolIds = upcomingGroups.map((g) => g.schoolId).filter((id): id is string => id !== null);
  if (schoolIds.length === 0) return [];

  const [schools, pendingGroups] = await Promise.all([
    prisma.school.findMany({ where: { id: { in: schoolIds } }, include: { city: true } }),
    prisma.event.groupBy({
      by: ["schoolId"],
      where: { schoolId: { in: schoolIds }, moderationStatus: "PENDING" },
      _count: { schoolId: true },
    }),
  ]);

  const upcomingMap = new Map(upcomingGroups.map((g) => [g.schoolId as string, g._count.schoolId]));
  const pendingMap = new Map(pendingGroups.map((g) => [g.schoolId as string, g._count.schoolId]));
  const schoolMap = new Map(schools.map((s) => [s.id, s]));

  return schoolIds
    .map((id) => schoolMap.get(id))
    .filter((s): s is NonNullable<typeof s> => !!s)
    .map((s) => ({
      id: s.id,
      slug: s.slug,
      name: s.name,
      cityName: s.city.nameRu,
      verificationStatus: s.verificationStatus,
      isActive: s.isActive,
      upcomingEventsCount: upcomingMap.get(s.id) ?? 0,
      pendingEventsCount: pendingMap.get(s.id) ?? 0,
    }));
}

export type FeedEvent = {
  id: string;
  slug: string;
  title: string;
  format: EventFormat;
  moderationStatus: ModerationStatus;
  cityName: string;
  schoolName: string | null;
  createdAt: string; // ISO
};

// "Лента живых событий" — последнее добавленное (по факту создания записи, не
// по дате самого мероприятия) независимо от статуса модерации: администратору
// нужно видеть именно то, что происходит в системе прямо сейчас, а не только
// уже одобренное.
export async function getRecentEventsFeed(limit = 12): Promise<FeedEvent[]> {
  const events = await prisma.event.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { city: true, school: true },
  });
  return events.map((e) => ({
    id: e.id,
    slug: e.slug,
    title: e.title,
    format: e.format,
    moderationStatus: e.moderationStatus,
    cityName: e.city.nameRu,
    schoolName: e.school?.name ?? e.organizerName ?? null,
    createdAt: e.createdAt.toISOString(),
  }));
}

export type SystemHealth = {
  dbSizeBytes: number;
  auditLogCount24h: number;
  newUsers24h: number;
  newEvents24h: number;
};

// "Состояние базы" — только то, что реально измеримо из самого приложения
// через уже существующее подключение Prisma: точный размер БД (обычный SQL,
// без Supabase Management API и без нового секрета) и реальная активность за
// последние 24 часа по собственным таблицам. Посещений/трафика сайта в этом
// проекте никто не считает (нет подключённой аналитики) — показывать такую
// цифру значило бы её выдумать (CLAUDE.md §60), поэтому её здесь нет.
export async function getSystemHealth(): Promise<SystemHealth> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [sizeRows, auditLogCount24h, newUsers24h, newEvents24h] = await Promise.all([
    prisma.$queryRaw<{ bytes: bigint }[]>`SELECT pg_database_size(current_database()) AS bytes`,
    prisma.auditLog.count({ where: { createdAt: { gte: since } } }),
    prisma.user.count({ where: { createdAt: { gte: since } } }),
    prisma.event.count({ where: { createdAt: { gte: since } } }),
  ]);
  return {
    dbSizeBytes: Number(sizeRows[0]?.bytes ?? 0n),
    auditLogCount24h,
    newUsers24h,
    newEvents24h,
  };
}
