import type { EventRegistrationStatus, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasEventAccess } from "./access";
import { RegistrationForbiddenError, RegistrationNotFoundError } from "./registration-service";
import { EVENT_REGISTRATION_STATUS_VALUES } from "@/lib/events/event-type-registry";

// §19 ТЗ (Event Statistics) — полноценное представление вместо 4 инлайн-
// плиток на "Обзоре" (которые остаются как есть, это не замена, а отдельная
// вкладка "Статистика" с разбивкой по статусам, оплате, неявке и динамикой
// регистраций по дням).

export type RegistrationStatistics = {
  totalOverall: number;
  byStatus: Record<EventRegistrationStatus, number>;
  paidCount: number;
  // Доля неявки — считается ТОЛЬКО среди тех, у кого реально было место
  // (REGISTERED/CONFIRMED/NO_SHOW): те, кто был в листе ожидания, отклонён
  // или отменил сам, никогда не получали шанс прийти, включать их в
  // знаменатель было бы некорректно. null — если знаменатель 0 (никто ещё
  // не получил место), чтобы не показывать обманчивые "0%".
  noShowRate: number | null;
  // По дням регистрации (createdAt::date), по возрастанию — считается в JS,
  // не raw SQL: типичное число регистраций у события мало (см. лимит
  // экспорта, registration-export.ts), группировка на сервере не нужна.
  registrationsByDay: { date: string; count: number }[];
};

export async function getEventRegistrationStatistics(eventId: string, user: User): Promise<RegistrationStatistics> {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw new RegistrationNotFoundError();
  if (!(await hasEventAccess(event, user))) throw new RegistrationForbiddenError("forbidden");

  const [grouped, paidCount, createdAtRows] = await Promise.all([
    prisma.eventRegistration.groupBy({ by: ["status"], where: { eventId }, _count: { _all: true } }),
    prisma.eventRegistration.count({ where: { eventId, isPaid: true } }),
    prisma.eventRegistration.findMany({ where: { eventId }, select: { createdAt: true } }),
  ]);

  const byStatus = Object.fromEntries(EVENT_REGISTRATION_STATUS_VALUES.map((s) => [s, 0])) as Record<EventRegistrationStatus, number>;
  let totalOverall = 0;
  for (const g of grouped) {
    byStatus[g.status] = g._count._all;
    totalOverall += g._count._all;
  }

  const everHadSlot = byStatus.REGISTERED + byStatus.CONFIRMED + byStatus.NO_SHOW;
  const noShowRate = everHadSlot > 0 ? byStatus.NO_SHOW / everHadSlot : null;

  const dayBuckets = new Map<string, number>();
  for (const row of createdAtRows) {
    const day = row.createdAt.toISOString().slice(0, 10);
    dayBuckets.set(day, (dayBuckets.get(day) ?? 0) + 1);
  }
  const registrationsByDay = [...dayBuckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count }));

  return { totalOverall, byStatus, paidCount, noShowRate, registrationsByDay };
}
