import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { uniqueSlug } from "@/lib/slug";
import { canCreateEvents } from "@/lib/auth";
import { shouldAutoApproveEvent } from "@/lib/events/moderation";
import { computePublishChecklist, isChecklistComplete, type ChecklistItem } from "@/lib/events/event-type-registry";
import { createCompetition } from "@/server/competition/create-competition";
import { can } from "@/server/rbac/authorize";
import { getActor } from "@/server/rbac/actor";
import type { EventDraftInput } from "./schemas";

// Event Engine — доменный сервис создания/обновления черновика события
// (CLAUDE.md §48/§53: бизнес-логика не в React/route handler'ах). Один
// сервис для Save Draft И Publish — разница только в том, какой checklist
// обязателен (см. ниже), не в двух параллельных путях кода.

export class EventForbiddenError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
export class EventValidationError extends Error {
  constructor(public issues: ChecklistItem[]) {
    super("event_incomplete");
  }
}
export class EventNotFoundError extends Error {}

const BASELINE_IDS = new Set(["title", "city", "venue", "startsAt"]);

// Даже сохранение ЧЕРНОВИКА требует минимум данных — этого требует сама
// таблица Event (title/cityId/venueName/startsAt NOT NULL, существовали до
// этой задачи, менять ради частично-пустых черновиков означало бы
// переписывать все места, которые уже читают event.city/event.startsAt как
// гарантированно существующие — EventCard, /events/[slug], поиск и т.д.).
// Поэтому до заполнения Basic/Location/Date-time шагов черновик существует
// только как локальное состояние мастера в браузере (см. PERFORMANCE в
// задаче — "use client state for unfinished form"), а не как строка в БД.
function assertBaseline(items: ChecklistItem[]) {
  const missing = items.filter((i) => BASELINE_IDS.has(i.id) && !i.ok);
  if (missing.length > 0) throw new EventValidationError(missing);
}

export async function upsertEventDraft(input: EventDraftInput, user: User, existingId?: string) {
  if (!canCreateEvents(user)) throw new EventForbiddenError("forbidden");

  const school = input.schoolId ? await prisma.school.findUnique({ where: { id: input.schoolId } }) : null;
  if (input.schoolId && (!school || (user.role === "SCHOOL_REP" && school.ownerUserId !== user.id))) {
    throw new EventForbiddenError("forbidden_school");
  }

  if (input.format === "CONTEST") {
    const actor = await getActor();
    if (!can(actor, "competition:create")) throw new EventForbiddenError("forbidden_competition_create");
  }

  const checklist = computePublishChecklist(input.format, {
    title: input.title,
    cityId: input.cityId,
    venueName: input.venueName,
    startsAt: input.startsAt,
    masterclassSessions: input.masterclass?.sessions,
  });
  assertBaseline(checklist);
  if (input.status === "PUBLISHED" && !isChecklistComplete(checklist)) {
    throw new EventValidationError(checklist.filter((i) => !i.ok));
  }

  const existing = existingId ? await prisma.event.findUnique({ where: { id: existingId } }) : null;
  if (existingId && (!existing || (existing.createdById !== user.id && user.role !== "ADMIN"))) {
    throw new EventForbiddenError("forbidden");
  }

  const autoApprove = shouldAutoApproveEvent(user, school);
  const startsAt = new Date(input.startsAt!);
  const endsAt = input.endsAt ? new Date(input.endsAt) : null;

  const event = await prisma.$transaction(async (tx) => {
    const base = {
      title: input.title!,
      cityId: input.cityId!,
      schoolId: input.schoolId || null,
      organizerName: input.schoolId ? null : input.organizerName || null,
      format: input.format,
      // event_type сегодня следует за форматом "конкурс" — та же логика, что
      // была в исходном /api/events до этой задачи.
      eventType: (input.format === "CONTEST" ? "CONTEST" : "REGULAR") as "CONTEST" | "REGULAR",
      level: input.level,
      startsAt,
      endsAt,
      venueName: input.venueName!,
      venueAddress: input.venueAddress || null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      capacity: input.capacity ?? null,
      registrationEnabled: input.registrationEnabled ?? false,
      description: input.description || null,
      // photoUrl НЕ пишется здесь намеренно — денормализованный кэш главной
      // афиши, единственный писатель — src/server/events/event-media-service.ts
      // (см. комментарий у поля в schema.prisma).
      priceText: input.priceText || null,
      externalLinkUrl: input.externalLinkUrl || null,
      tags: input.tags ?? [],
      status: input.status,
    };

    let row;
    if (existing) {
      const movingDraftToPublished = existing.status === "DRAFT" && input.status === "PUBLISHED";
      row = await tx.event.update({
        where: { id: existing.id },
        data: {
          ...base,
          // Отправка на модерацию/авто-approve происходит один раз, в момент
          // первого Publish — повторное сохранение уже опубликованного
          // события не должно тихо перезапускать модерацию заново.
          ...(movingDraftToPublished
            ? autoApprove
              ? { moderationStatus: "APPROVED" as const, moderatedAt: new Date() }
              : { moderationStatus: "PENDING" as const }
            : {}),
        },
      });
    } else {
      const slug = await uniqueSlug("event", input.title!);
      row = await tx.event.create({
        data: {
          ...base,
          slug,
          createdById: user.id,
          ...(input.status === "PUBLISHED"
            ? autoApprove
              ? { moderationStatus: "APPROVED" as const, moderatedAt: new Date() }
              : { moderationStatus: "PENDING" as const }
            : {}),
        },
      });
    }

    // Type-specific данные — полная замена на каждое сохранение (черновик
    // сохраняется целиком по явному действию, не по полю, см. PERFORMANCE в
    // задаче), не диффинг построчно: объём (тэги/сессии/цены) всегда мал.
    await tx.eventPriceOption.deleteMany({ where: { eventId: row.id } });
    if (input.priceOptions?.length) {
      await tx.eventPriceOption.createMany({
        data: input.priceOptions.map((p, order) => ({
          eventId: row.id,
          label: p.label,
          price: p.price ?? null,
          currency: p.currency || null,
          order,
        })),
      });
    }

    if (input.format === "PARTY") {
      await tx.masterclassDetails.deleteMany({ where: { eventId: row.id } });
      await tx.partyDetails.upsert({
        where: { eventId: row.id },
        create: { eventId: row.id, ...(input.party ?? {}) },
        update: { ...(input.party ?? {}) },
      });
    } else if (input.format === "MASTERCLASS") {
      await tx.partyDetails.deleteMany({ where: { eventId: row.id } });
      const details = await tx.masterclassDetails.upsert({
        where: { eventId: row.id },
        create: {
          eventId: row.id,
          style: input.masterclass?.style || null,
          format: input.masterclass?.format || null,
          partnerRequired: input.masterclass?.partnerRequired ?? false,
        },
        update: {
          style: input.masterclass?.style || null,
          format: input.masterclass?.format || null,
          partnerRequired: input.masterclass?.partnerRequired ?? false,
        },
      });
      await tx.masterclassSession.deleteMany({ where: { masterclassDetailsId: details.id } });
      if (input.masterclass?.sessions?.length) {
        await tx.masterclassSession.createMany({
          data: input.masterclass.sessions.map((s, order) => ({
            masterclassDetailsId: details.id,
            title: s.title,
            teacherId: s.teacherId || null,
            startTime: new Date(s.startTime),
            endTime: new Date(s.endTime),
            room: s.room || null,
            level: s.level ?? null,
            capacity: s.capacity ?? null,
            order,
          })),
        });
      }
    } else {
      await tx.partyDetails.deleteMany({ where: { eventId: row.id } });
      await tx.masterclassDetails.deleteMany({ where: { eventId: row.id } });
    }

    return row;
  });

  // Competition создаётся ВНЕ транзакции Event (createCompetition — уже
  // существующий, отдельно протестированный сервис со своей транзакцией и
  // аудитом, не форкаем его ради вложенного tx). Если это упадёт, Event уже
  // сохранён как валидный черновик/анонс — повторное сохранение с тем же
  // форматом CONTEST просто попробует создать связь снова (event.competition
  // проверяется заново).
  let competitionId: string | null = null;
  if (input.format === "CONTEST") {
    const withCompetition = await prisma.event.findUnique({ where: { id: event.id }, include: { competition: true } });
    if (!withCompetition?.competition) {
      const created = await createCompetition({
        name: input.title!,
        cityId: input.cityId,
        venue: input.venueName,
        timezone: "Europe/Minsk",
        startAt: startsAt,
        endAt: endsAt ?? undefined,
        eventId: event.id,
      });
      competitionId = created.id;
    } else {
      competitionId = withCompetition.competition.id;
    }
  }

  return { event, competitionId };
}

export async function getEventDraftForEdit(eventId: string, user: User) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      city: true,
      school: true,
      partyDetails: true,
      masterclassDetails: { include: { sessions: { orderBy: { order: "asc" } } } },
      priceOptions: { orderBy: { order: "asc" } },
      media: { orderBy: { sortOrder: "asc" } },
      competition: true,
    },
  });
  if (!event) throw new EventNotFoundError();
  if (event.createdById !== user.id && user.role !== "ADMIN") throw new EventForbiddenError("forbidden");
  return event;
}
