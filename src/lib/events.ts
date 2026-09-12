import { prisma } from "./prisma";
import type { Prisma, EventFormat, DanceLevel } from "@prisma/client";

// Простая работа с датами без внешних библиотек: сервер трактует "сегодня" и
// "эта неделя" в своей локальной таймзоне. Для MVP это приемлемое упрощение —
// вся аудитория в одном поясе (Europe/Minsk); при желании можно зафиксировать
// TZ переменной окружения контейнера.
export function todayRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export function thisWeekRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start, end };
}

const activeEventFilter = (): Prisma.EventWhereInput => ({
  moderationStatus: "APPROVED",
  isArchived: false,
});

export function eventsForHome(cityId: string | null) {
  const { end: weekEnd } = thisWeekRange();
  const { start: todayStart, end: todayEnd } = todayRange();

  const cityFilter: Prisma.EventWhereInput = cityId ? { cityId } : {};

  return Promise.all([
    prisma.event.findMany({
      where: {
        ...activeEventFilter(),
        ...cityFilter,
        startsAt: { gte: todayStart, lt: todayEnd },
      },
      orderBy: { startsAt: "asc" },
      include: { city: true, school: true },
    }),
    prisma.event.findMany({
      where: {
        ...activeEventFilter(),
        ...cityFilter,
        // "на этой неделе" = после сегодняшних (которые уже показаны отдельным
        // блоком) и до конца 7-дневного окна.
        startsAt: { gte: todayEnd, lt: weekEnd },
      },
      orderBy: { startsAt: "asc" },
      include: { city: true, school: true },
      take: 12,
    }),
  ]);
}

// month: 1-12 (человеческий номер месяца, не JS-индекс с нуля) — так его
// удобнее передавать в URL/query-параметрах API и меньше риска ошибиться на
// вызывающей стороне.
export function monthRange(year: number, month: number) {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);
  return { start, end };
}

export type CalendarEvent = {
  id: string;
  slug: string;
  title: string;
  format: EventFormat;
  startsAt: Date;
  cityName: string;
  schoolName: string | null;
};

// Публичные данные для визуального календаря на главной — тот же принцип
// allowlist полей, что и у getPublicCompetitionView (CLAUDE.md §42): наружу
// отдаётся только то, что и так видно на /events карточкой события.
export async function eventsForCalendarMonth(cityId: string | null, year: number, month: number): Promise<CalendarEvent[]> {
  const { start, end } = monthRange(year, month);
  const cityFilter: Prisma.EventWhereInput = cityId ? { cityId } : {};

  const events = await prisma.event.findMany({
    where: {
      ...activeEventFilter(),
      ...cityFilter,
      startsAt: { gte: start, lt: end },
    },
    orderBy: { startsAt: "asc" },
    include: { city: true, school: true },
  });

  return events.map((e) => ({
    id: e.id,
    slug: e.slug,
    title: e.title,
    format: e.format,
    startsAt: e.startsAt,
    cityName: e.city.nameRu,
    schoolName: e.school?.name ?? null,
  }));
}

export type EventFilters = {
  citySlug?: string;
  format?: string;
  level?: string;
  schoolSlug?: string;
  dateFrom?: string;
  dateTo?: string;
};

export async function searchEvents(filters: EventFilters) {
  const where: Prisma.EventWhereInput = { ...activeEventFilter() };

  if (filters.citySlug) {
    where.city = { slug: filters.citySlug };
  }
  if (filters.format) {
    where.format = filters.format as EventFormat;
  }
  if (filters.level) {
    where.level = filters.level as DanceLevel;
  }
  if (filters.schoolSlug) {
    where.school = { slug: filters.schoolSlug };
  }
  const startsAt: Prisma.DateTimeFilter = {};
  if (filters.dateFrom) startsAt.gte = new Date(filters.dateFrom);
  if (filters.dateTo) {
    const d = new Date(filters.dateTo);
    d.setDate(d.getDate() + 1);
    startsAt.lt = d;
  }
  if (Object.keys(startsAt).length) {
    where.startsAt = startsAt;
  } else {
    // без фильтра по дате показываем только предстоящие события
    where.startsAt = { gte: new Date() };
  }

  return prisma.event.findMany({
    where,
    orderBy: { startsAt: "asc" },
    include: { city: true, school: true },
    take: 100,
  });
}
