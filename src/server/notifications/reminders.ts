import { prisma } from "@/lib/prisma";
import { emitDomainEvent } from "./emit-domain-event";
import { formatEventDate, formatEventTime } from "@/lib/format";

// NOTIF-001 — напоминания T-минус-N до начала события. В отличие от
// остальных доменных событий (создаются ОДИН раз внутри уже существующей
// бизнес-транзакции — публикация/изменение/отмена события), реминдеру
// неоткуда взяться из одного действия пользователя: его должен родить
// периодический sweep (см. src/app/api/cron/notifications/sweep/route.ts).
//
// Один EVENT_REMINDER-job на ПАРУ (событие, hoursBefore) — не на пользователя:
// аудитория (подписчики на EVENT/CITY/EVENT_TYPE/SCHOOL/ORGANIZER) резолвится
// стандартным Audience Resolver'ом, как и у EVENT_PUBLISHED, а какое именно
// hoursBefore подходит конкретному подписчику — фильтрует PREFERENCE_GATES
// в process-job.ts (сверяет с его собственным NotificationPreference.
// reminderHoursBefore, который у каждого пользователя свой список).
// Идемпотентность через emitDomainEvent() (upsert по idempotencyKey)
// избавляет от необходимости попадать точно в момент N часов до старта —
// достаточно эту границу когда-нибудь пересечь, повторный sweep не
// продублирует уведомление.
export async function processDueEventReminders(): Promise<number> {
  const prefs = await prisma.notificationPreference.findMany({
    where: { notifyReminders: true },
    select: { reminderHoursBefore: true },
  });
  const hoursSet = new Set<number>();
  for (const p of prefs) for (const h of p.reminderHoursBefore) if (h > 0) hoursSet.add(h);
  if (hoursSet.size === 0) return 0;

  const maxHours = Math.max(...hoursSet);
  const events = await prisma.event.findMany({
    where: {
      status: "PUBLISHED",
      moderationStatus: "APPROVED",
      startsAt: { gt: new Date(), lte: new Date(Date.now() + maxHours * 3_600_000) },
    },
    select: { id: true, slug: true, title: true, startsAt: true, cityId: true, format: true, schoolId: true, createdById: true },
  });

  let emitted = 0;
  for (const event of events) {
    for (const hoursBefore of hoursSet) {
      const threshold = new Date(event.startsAt.getTime() - hoursBefore * 3_600_000);
      if (threshold > new Date()) continue; // порог "за N часов" ещё не наступил для этого события

      await prisma.$transaction((tx) =>
        emitDomainEvent(tx, {
          type: "EVENT_REMINDER",
          payload: {
            entityId: event.id,
            eventSlug: event.slug,
            title: event.title,
            date: `${formatEventDate(event.startsAt)}, ${formatEventTime(event.startsAt)}`,
            cityId: event.cityId,
            format: event.format,
            schoolId: event.schoolId,
            createdById: event.createdById,
            hoursBefore,
          },
          idempotencyKey: `EVENT_REMINDER:${event.id}:${hoursBefore}`,
        })
      );
      emitted++;
    }
  }
  return emitted;
}
