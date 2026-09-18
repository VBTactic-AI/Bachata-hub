import { prisma } from "@/lib/prisma";
import { uniqueSlug } from "@/lib/slug";
import { formatEventDate } from "@/lib/format";
import { emitDomainEvent } from "@/server/notifications/emit-domain-event";
import { requirePermission } from "../rbac/authorize";
import { writeAudit } from "../audit/audit";
import type { CreateCompetitionInput } from "./schemas";

// competition:create — только SUPER_ADMIN (03 §4). Дальше создатель
// автоматически становится EVENT_ADMIN этого соревнования (см. ниже) — иначе
// после создания у него самого не будет ни одного права внутри него, т.к.
// EVENT_ADMIN назначается через CompetitionMember, а не глобально.
//
// Публичная карточка события создаётся ВМЕСТЕ с соревнованием, одним
// действием (2026-09-18, по прямому запросу пользователя) — раньше Event
// Wizard мог создать Event с format=CONTEST отдельно от самого соревнования
// (Competition подтягивался только при публикации, см. комментарий у
// WIZARD_SELECTABLE_EVENT_FORMATS в lib/events/event-type-registry.ts), из-за
// чего на практике оказывались события без связанной Competition и наоборот.
// Теперь единственный путь создать НОВОЕ соревнование с публичной афишей —
// этот один вызов; eventId в input — единственная лазейка в обход (уже
// существующий Event, ничего не создаём) — используется только вызовом из
// event-service.ts (реконсиляция легаси CONTEST-событий, заведённых ДО этой
// задачи). "ALL_LEVELS" по умолчанию — соревнование по построению открыто
// сразу нескольким дивизионам/уровням, а не одному конкретному.
export async function createCompetition(
  input: CreateCompetitionInput
): Promise<{ id: string; slug: string; eventId: string | null; eventSlug: string | null }> {
  const actor = await requirePermission("competition:create");
  const slug = await uniqueSlug("competition", input.name);
  const eventAdminRole = await prisma.role.findUniqueOrThrow({ where: { code: "EVENT_ADMIN" } });

  const result = await prisma.$transaction(async (tx) => {
    let eventId = input.eventId ?? null;
    let eventSlug: string | null = null;

    if (eventId) {
      const existingEvent = await tx.event.findUnique({ where: { id: eventId }, select: { slug: true } });
      eventSlug = existingEvent?.slug ?? null;
    } else if (input.cityId && input.venue && input.startAt) {
      const newEventSlug = await uniqueSlug("event", input.name);
      const event = await tx.event.create({
        data: {
          title: input.name,
          cityId: input.cityId,
          organizerName: input.organizerName || null,
          format: "CONTEST",
          eventType: "CONTEST",
          level: input.level ?? "ALL_LEVELS",
          startsAt: input.startAt,
          endsAt: input.endAt ?? null,
          venueName: input.venue,
          venueAddress: input.venueAddress || null,
          description: input.description || null,
          slug: newEventSlug,
          // competition:create — только SUPER_ADMIN (см. докстрку выше),
          // модерация не нужна — тот же принцип, что и у shouldAutoApproveEvent
          // для роли ADMIN в event-service.ts.
          status: "PUBLISHED",
          moderationStatus: "APPROVED",
          moderatedAt: new Date(),
          createdById: actor.userId,
        },
      });
      eventId = event.id;
      eventSlug = event.slug;

      await emitDomainEvent(tx, {
        type: "EVENT_PUBLISHED",
        payload: {
          entityId: event.id,
          eventSlug: event.slug,
          title: event.title,
          date: formatEventDate(event.startsAt),
          cityId: event.cityId,
          format: event.format,
          schoolId: null,
          createdById: event.createdById,
        },
        idempotencyKey: `EVENT_PUBLISHED:${event.id}`,
      });
    }

    const created = await tx.competition.create({
      data: {
        name: input.name,
        slug,
        description: input.description,
        organizerName: input.organizerName,
        venue: input.venue,
        cityId: input.cityId,
        timezone: input.timezone,
        startAt: input.startAt,
        endAt: input.endAt,
        eventId,
        createdById: actor.userId,
      },
    });

    await tx.competitionMember.create({
      data: {
        competitionId: created.id,
        userId: actor.userId,
        roleId: eventAdminRole.id,
        addedById: actor.userId,
      },
    });

    await writeAudit(tx, {
      actor,
      action: "competition.create",
      entityType: "Competition",
      entityId: created.id,
      after: { name: created.name, slug: created.slug, status: created.status, eventId },
    });

    return { id: created.id, slug: created.slug, eventId, eventSlug };
  });

  return result;
}
