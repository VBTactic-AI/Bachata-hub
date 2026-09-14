import { unstable_cache } from "next/cache";
import type { EventFormat, SchoolVerificationStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { activeEventFilter, todayRange, thisWeekRange } from "./events";
import { formatEventCardPrice } from "./event-price";
import { OTHER_EVENTS_ID } from "./school-discovery-constants";

export { OTHER_EVENTS_ID };

// Данные для интерактивного блока "Школы → события" на главной (ТЗ
// пользователя, 2026-09-14, дополнено 2026-09-14: карусель переехала наверх,
// "Сегодня"/"Ближайшие (1 неделя)" стали частью карусели вместо отдельных
// безусловных блоков). Все поля — реальные, ничего не выдумываем:
// - avgRating/reviewCount — то же вычисление, что уже делает /schools/[slug]
//   (school.reviews.filter(APPROVED), sum/length) — не новый алгоритм.
// - teachersCount — уже использовалось на главной (_count.teachers).
// - upcomingEventsCount / otherEventsCount — реальные счётчики (тот же
//   activeEventFilter(), startsAt >= now, что и у /events).
// Полей "рейтинг школы"/"участников школы" из первоначального ТЗ-примера
// в схеме НЕТ — вместо выдуманного "участников" показываем реальное число
// преподавателей.

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
  // "Другие события" (по прямому решению пользователя, 2026-09-14) —
  // отдельная псевдо-карточка для событий БЕЗ привязанной школы (просто
  // вечеринки без школы-организатора). Раньше такие события показывались в
  // безусловных блоках "Сегодня"/"Ближайшие" наверху страницы — при переносе
  // этих блоков внутрь карусели школ понадобилась отдельная карточка-фильтр,
  // чтобы не потерять их из виду (карточка "Все школы" по своему буквальному
  // смыслу их не включает).
  otherEventsCount: number;
};

// Список школ меняется редко — кэшируем на 10 минут (CLAUDE.md/ТЗ п.24:
// "школы можно кешировать, например revalidate 5-15 минут"), по тому же
// принципу, что и getActiveCities (src/lib/cities.ts). cityId — часть ключа
// кэша (unstable_cache сам различает записи по аргументам вызова), т.к.
// карусель школ фильтруется по городу зрителя так же, как и события (по
// прямому запросу пользователя, 2026-09-14) — иначе счётчики на карточках
// расходились бы со списком событий, отфильтрованным по городу.
export const getSchoolDiscoveryData = unstable_cache(
  async (cityId: string | null): Promise<SchoolDiscoveryData> => {
    const now = new Date();
    const cityFilter = cityId ? { cityId } : {};
    const [schools, otherEventsCount] = await Promise.all([
      prisma.school.findMany({
        where: { isActive: true, ...cityFilter },
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
      }),
      prisma.event.count({ where: { ...activeEventFilter(), ...cityFilter, startsAt: { gte: now }, schoolId: null } }),
    ]);

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
      otherEventsCount,
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

export type DiscoveryEventGroups = {
  today: SchoolDiscoveryEvent[];
  thisWeek: SchoolDiscoveryEvent[];
};

function mapEvent(e: {
  id: string;
  slug: string;
  title: string;
  format: EventFormat;
  startsAt: Date;
  city: { nameRu: string };
  school: { name: string } | null;
  photoUrl: string | null;
  priceText: string | null;
  priceOptions: { price: unknown; currency: string | null }[];
}): SchoolDiscoveryEvent {
  return {
    id: e.id,
    slug: e.slug,
    title: e.title,
    format: e.format,
    startsAt: e.startsAt.toISOString(),
    cityName: e.city.nameRu,
    schoolName: e.school?.name ?? null,
    photoUrl: e.photoUrl,
    price: formatEventCardPrice(e.priceText, e.priceOptions as { price: number | string | null; currency: string | null }[]),
  };
}

// filter: null → "Все школы" (событие ЛЮБОЙ школы, schoolId не null);
// OTHER_EVENTS_ID → "Другие события" (schoolId=null, организатор не школа);
// иначе → события конкретной школы. Разбивка на "Сегодня"/"Ближайшие 7 дней"
// — те же диапазоны дат (todayRange/thisWeekRange), что раньше использовала
// удалённая eventsForHome, просто теперь сначала фильтруются по выбранной
// карточке карусели, а не показываются безусловно.
//
// Фильтр по городу — тот же cityId, что уже используется для школ в
// getSchoolDiscoveryData (по прямому запросу пользователя, 2026-09-14: "и
// карусель, и события должны фильтроваться по городу одинаково") — иначе
// счётчик на карточке ("N школ · N событий", глобальный/по городу) и список
// событий ниже расходились бы.
export async function getDiscoveryEventGroups(filter: string | null, cityId: string | null, weekLimit = 12): Promise<DiscoveryEventGroups> {
  const schoolWhere = filter === OTHER_EVENTS_ID ? { schoolId: null } : filter ? { schoolId: filter } : { schoolId: { not: null } };
  const cityFilter = cityId ? { cityId } : {};
  const { start: todayStart, end: todayEnd } = todayRange();
  const { end: weekEnd } = thisWeekRange();

  const [todayEvents, weekEvents] = await Promise.all([
    prisma.event.findMany({
      where: { ...activeEventFilter(), ...cityFilter, ...schoolWhere, startsAt: { gte: todayStart, lt: todayEnd } },
      orderBy: { startsAt: "asc" },
      include: { city: true, school: true, priceOptions: { orderBy: { order: "asc" } } },
    }),
    prisma.event.findMany({
      where: { ...activeEventFilter(), ...cityFilter, ...schoolWhere, startsAt: { gte: todayEnd, lt: weekEnd } },
      orderBy: { startsAt: "asc" },
      take: weekLimit,
      include: { city: true, school: true, priceOptions: { orderBy: { order: "asc" } } },
    }),
  ]);

  return { today: todayEvents.map(mapEvent), thisWeek: weekEvents.map(mapEvent) };
}
