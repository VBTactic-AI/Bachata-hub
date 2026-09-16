import { prisma } from "@/lib/prisma";
import { shouldAutoApproveEvent } from "@/lib/events/moderation";
import { formatEventDate } from "@/lib/format";
import { emitDomainEvent } from "@/server/notifications/emit-domain-event";
import { decidePublishModeration } from "./event-service";
import { computePublishAt } from "./recurrence";

// Auto Publish (задача §7) — вызывается периодическим cron'ом рядом с
// generateSeriesOccurrences. Публикует только occurrences серий со
// status="ACTIVE" (НЕ "PAUSED" — осознанное решение: организатор поставил
// серию на паузу именно чтобы она "не жила своей жизнью", молчаливая
// автопубликация ещё не опубликованных черновиков во время паузы нарушала бы
// это ожидание; уже опубликованные occurrences пауза не трогает вообще, как
// и требует задача §12).
//
// Модерация — ТА ЖЕ политика, что и при публикации человеком
// (upsertEventDraft в event-service.ts): решает shouldAutoApproveEvent() по
// автору серии (createdBy) и его школе, не отдельное "cron всегда approve"
// правило — иначе автопубликация обходила бы модерацию сайта для
// неверифицированных организаторов, чего никто не просил (CLAUDE.md §60 "не
// обходи RBAC/модерацию тихими исключениями").
export async function publishDueSeriesOccurrences(): Promise<{ published: number }> {
  const now = new Date();

  const candidates = await prisma.event.findMany({
    where: {
      status: "DRAFT",
      seriesId: { not: null },
      series: { autoPublish: true, status: "ACTIVE" },
    },
    include: {
      series: true,
      school: true,
      createdBy: true,
    },
  });

  let published = 0;
  for (const event of candidates) {
    // occurrenceDate/publishDaysBefore/publishAtTime гарантированно заполнены —
    // это occurrence серии (seriesId not null, проверено в where выше), а
    // publishDaysBefore/publishAtTime обязательны вместе с autoPublish=true
    // (event-series-service.ts). Голый "!" здесь безопасен, не заглушка.
    const publishAt = computePublishAt(event.occurrenceDate!, event.series!.publishDaysBefore!, event.series!.publishAtTime!, event.series!.timezone);
    if (publishAt.getTime() > now.getTime()) continue; // ещё не время

    const autoApprove = shouldAutoApproveEvent(event.createdBy, event.school);
    const { moderationFields, notifyPublished } = decidePublishModeration(event.moderationStatus, autoApprove);

    await prisma.$transaction(async (tx) => {
      const row = await tx.event.update({
        where: { id: event.id },
        data: { status: "PUBLISHED", ...moderationFields },
      });

      if (notifyPublished) {
        await emitDomainEvent(tx, {
          type: "EVENT_PUBLISHED",
          payload: {
            entityId: row.id,
            eventSlug: row.slug,
            title: row.title,
            date: formatEventDate(row.startsAt),
            cityId: row.cityId,
            format: row.format,
            schoolId: row.schoolId,
            createdById: row.createdById,
          },
          idempotencyKey: `EVENT_PUBLISHED:${row.id}`,
        });
      }
    });

    published++;
  }

  return { published };
}
