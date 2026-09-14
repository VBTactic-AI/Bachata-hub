import { unstable_cache } from "next/cache";
import type { EventFormat, SchoolVerificationStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { activeEventFilter } from "./events";
import { formatEventCardPrice } from "./event-price";

// Данные для интерактивного блока "Школы → события" на главной (по прямому
// ТЗ пользователя, 2026-09-14). Все поля — реальные, ничего не выдумываем:
// - avgRating/reviewCount — то же вычисление, что уже делает /schools/[slug]
//   (school.reviews.filter(APPROVED), sum/length) — не новый алгоритм, тот
//   же самый, просто переиспользован здесь для карточки в карусели.
// - teachersCount — уже использовалось на главной (_count.teachers).
// - upcomingEventsCount — реальный счётчик предстоящих событий школы
//   (activeEventFilter(), startsAt >= now), тот же фильтр, что и /events.
// Полей "рейтинг школы"/"участников школы" из первоначального ТЗ-примера
// в схеме НЕТ — школа не хранит фото/аватар и не считает "участников"
// (это понятие есть только у соревнований, docs/02). Явные примеры в ТЗ
// ("⭐ 4.9", "125 участников") — иллюстрация формата, а не список
// обязательных полей; вместо выдуманного "участников" показываем реальное
// число преподавателей.

export type SchoolDiscoveryItem = {
  id: string;
  slug: string;
  name: string;
  cityName: string;
  description: string | null;
  directions: string[];
  verificationStatus: SchoolVerificationStatus;
  teachersCount: number;
  avgRating: number | null;
  reviewCount: number;
  upcomingEventsCount: number;
};

export type SchoolDiscoveryData = {
  schools: SchoolDiscoveryItem[];
  totalSchools: number;
  totalUpcomingEvents: number;
};

// Список школ меняется редко — кэшируем на 10 минут (CLAUDE.md/ТЗ п.24:
// "школы можно кешировать, например revalidate 5-15 минут"), по тому же
// принципу, что и getActiveCities (src/lib/cities.ts).
export const getSchoolDiscoveryData = unstable_cache(
  async (): Promise<SchoolDiscoveryData> => {
    const now = new Date();
    const schools = await prisma.school.findMany({
      where: { isActive: true },
      include: {
        city: true,
        _count: { select: { teachers: true } },
        reviews: { where: { moderationStatus: "APPROVED" }, select: { rating: true } },
        events: {
          where: { ...activeEventFilter(), startsAt: { gte: now } },
          select: { id: true },
        },
      },
      orderBy: [{ verificationStatus: "asc" }, { name: "asc" }],
    });

    const items: SchoolDiscoveryItem[] = schools.map((s) => {
      const avgRating = s.reviews.length > 0 ? s.reviews.reduce((sum, r) => sum + r.rating, 0) / s.reviews.length : null;
      return {
        id: s.id,
        slug: s.slug,
        name: s.name,
        cityName: s.city.nameRu,
        description: s.description,
        directions: s.directions,
        verificationStatus: s.verificationStatus,
        teachersCount: s._count.teachers,
        avgRating,
        reviewCount: s.reviews.length,
        upcomingEventsCount: s.events.length,
      };
    });

    return {
      schools: items,
      totalSchools: items.length,
      totalUpcomingEvents: items.reduce((sum, s) => sum + s.upcomingEventsCount, 0),
    };
  },
  ["school-discovery-data"],
  { revalidate: 600, tags: ["school-discovery"] }
);

export type SchoolDiscoveryEvent = {
  id: string;
  slug: string;
  title: string;
  format: EventFormat;
  startsAt: string;
  cityName: string;
  schoolName: string | null;
  photoUrl: string | null;
  price: string | null;
};

// schoolId === null → "Все школы": события ЛЮБОЙ школы (schoolId не null),
// не вообще все события платформы — это фильтр по школам, а не по всему
// календарю (у части событий вообще нет привязанной школы, они вне области
// действия этого блока, для них уже есть отдельный /events).
export async function getUpcomingEventsForSchool(schoolId: string | null, limit = 6): Promise<SchoolDiscoveryEvent[]> {
  const now = new Date();
  const events = await prisma.event.findMany({
    where: {
      ...activeEventFilter(),
      startsAt: { gte: now },
      schoolId: schoolId ?? { not: null },
    },
    orderBy: { startsAt: "asc" },
    take: limit,
    include: { city: true, school: true, priceOptions: { orderBy: { order: "asc" } } },
  });

  return events.map((e) => ({
    id: e.id,
    slug: e.slug,
    title: e.title,
    format: e.format,
    startsAt: e.startsAt.toISOString(),
    cityName: e.city.nameRu,
    schoolName: e.school?.name ?? null,
    photoUrl: e.photoUrl,
    price: formatEventCardPrice(e.priceText, e.priceOptions),
  }));
}
