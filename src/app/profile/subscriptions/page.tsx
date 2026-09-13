import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listSubscriptions } from "@/server/notifications/subscriptions";
import { SubscriptionsManager, type SubscriptionItem } from "@/components/notifications/SubscriptionsManager";

const FORMAT_LABELS: Record<string, string> = {
  PARTY: "Вечеринки",
  MASTERCLASS: "Мастер-классы",
  FESTIVAL: "Фестивали",
  CONTEST: "Конкурсы (JNJ)",
  INTENSIVE: "Воркшоп-интенсивы",
};

export default async function SubscriptionsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [subscriptions, activeCities] = await Promise.all([
    listSubscriptions(user.id),
    prisma.city.findMany({ where: { isActive: true }, select: { id: true, nameRu: true }, orderBy: { nameRu: "asc" } }),
  ]);

  const idsByType = (type: string) => subscriptions.filter((s) => s.type === type).map((s) => s.targetId);

  const [schools, events, cities, countries, instructors] = await Promise.all([
    prisma.school.findMany({ where: { id: { in: idsByType("SCHOOL") } }, select: { id: true, name: true, slug: true } }),
    prisma.event.findMany({ where: { id: { in: idsByType("EVENT") } }, select: { id: true, title: true, slug: true } }),
    prisma.city.findMany({ where: { id: { in: idsByType("CITY") } }, select: { id: true, nameRu: true } }),
    prisma.country.findMany({ where: { id: { in: idsByType("COUNTRY") } }, select: { id: true, nameRu: true } }),
    prisma.teacher.findMany({ where: { id: { in: idsByType("INSTRUCTOR") } }, select: { id: true, name: true } }),
  ]);

  // Резолв имени по targetId — Subscription сама по себе не хранит связь
  // (универсальная модель type+targetId, см. Phase 1/2), поэтому имена
  // подтягиваются отдельными запросами по каждому типу.
  const items: SubscriptionItem[] = subscriptions
    .map((s): SubscriptionItem | null => {
      switch (s.type) {
        case "SCHOOL": {
          const school = schools.find((x) => x.id === s.targetId);
          return school ? { id: s.id, type: "SCHOOL", targetId: s.targetId, label: school.name, href: `/schools/${school.slug}` } : null;
        }
        case "EVENT": {
          const event = events.find((x) => x.id === s.targetId);
          return event ? { id: s.id, type: "EVENT", targetId: s.targetId, label: event.title, href: `/events/${event.slug}` } : null;
        }
        case "CITY": {
          const city = cities.find((x) => x.id === s.targetId);
          return city ? { id: s.id, type: "CITY", targetId: s.targetId, label: city.nameRu } : null;
        }
        case "COUNTRY": {
          const country = countries.find((x) => x.id === s.targetId);
          return country ? { id: s.id, type: "COUNTRY", targetId: s.targetId, label: country.nameRu } : null;
        }
        case "INSTRUCTOR": {
          const teacher = instructors.find((x) => x.id === s.targetId);
          return teacher ? { id: s.id, type: "INSTRUCTOR", targetId: s.targetId, label: teacher.name } : null;
        }
        case "EVENT_TYPE":
          return { id: s.id, type: "EVENT_TYPE", targetId: s.targetId, label: FORMAT_LABELS[s.targetId] ?? s.targetId };
        default:
          return null;
      }
    })
    // Подписка могла остаться "осиротевшей" (школа/событие удалены) —
    // не показываем её как есть с пустым именем, но и не удаляем молча из
    // БД сами: это не бизнес-операция этой страницы.
    .filter((i): i is SubscriptionItem => i !== null);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="m-0 font-night text-xl font-extrabold tracking-tight text-night-text">Мои подписки</h1>
      <SubscriptionsManager initialItems={items} activeCities={activeCities} />
    </div>
  );
}
