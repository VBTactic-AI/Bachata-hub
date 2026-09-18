import { prisma } from "@/lib/prisma";

// Авто-архивация прошедших событий (2026-09-19, по прямому запросу
// пользователя) — вызывается тем же периодическим sweep'ом, что и
// генерация/публикация регулярных серий (см. api/cron/notifications/sweep/
// route.ts) — единственный периодический механизм проекта, отдельный cron
// не заводим.
//
// Выставляет ТОЛЬКО isArchived=true — задуманное для этого поле (см.
// комментарий у Event.isArchived в schema.prisma: "просроченные события
// уходят из ленты, но не удаляются"), которое до этой задачи никто нигде не
// выставлял. НЕ трогает status/moderationStatus: событие остаётся
// status=PUBLISHED, поэтому по прямой ссылке страница события продолжает
// открываться всем как и раньше (isEventDirectlyVisible в lib/events.ts
// сознательно не проверяет isArchived — см. её комментарий). Пропадает
// только из активных лент/календаря/sitemap (activeEventFilter() уже
// проверяет isArchived) — организатор при этом видит его в "Мои события" под
// плашкой "В архиве" (myEventStatusLabel/myEventStatusFilterWhere тоже
// учитывают isArchived, см. event-type-registry.ts). Терминальный переход
// status="ARCHIVED" остаётся только за ручной отменой организатора
// (cancelEvent()) — это осознанно другое состояние, здесь его не ставим.
//
// "Прошло" = endsAt, если оно заполнено, иначе startsAt — тот же критерий
// "событие завершилось", что уже используется в registration-service.ts
// (syncNoShowForEvent: `event.endsAt ?? event.startsAt`), не выдумывается
// заново.
export async function archiveDueEvents(): Promise<{ archived: number }> {
  const now = new Date();
  const result = await prisma.event.updateMany({
    where: {
      status: "PUBLISHED",
      moderationStatus: "APPROVED",
      isArchived: false,
      OR: [{ endsAt: { lt: now } }, { endsAt: null, startsAt: { lt: now } }],
    },
    data: { isArchived: true },
  });
  return { archived: result.count };
}
