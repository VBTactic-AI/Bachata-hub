import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { uniqueSlug } from "@/lib/slug";
import { canCreateEvents } from "@/lib/auth";
import { formatEventDate } from "@/lib/format";
import { shouldAutoApproveEvent } from "@/lib/events/moderation";
import { logModeration } from "@/lib/moderation";
import { computePublishChecklist, isChecklistComplete, type ChecklistItem } from "@/lib/events/event-type-registry";
import { createCompetition } from "@/server/competition/create-competition";
import { can } from "@/server/rbac/authorize";
import { getActor } from "@/server/rbac/actor";
import { emitDomainEvent } from "@/server/notifications/emit-domain-event";
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

// Понятные сообщения (CLAUDE.md §46) для кодов EventForbiddenError, у которых
// причина не самоочевидна из самого кода — используется обоими роутами
// (/api/events, /api/event-drafts/[id]), не дублируется в каждом.
export const EVENT_FORBIDDEN_MESSAGES: Record<string, string> = {
  event_archived: "Событие в архиве — редактирование недоступно.",
  forbidden: "У вашего аккаунта нет прав на создание или редактирование событий.",
  forbidden_school: "Вы не можете создавать события от имени этой школы.",
  forbidden_competition_create: "У вашего аккаунта нет прав на создание соревнований.",
};

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
  // QA BUG-001: ARCHIVED — терминальное состояние для этого сервиса (сюда
  // ведёт только cancelEvent()). Без этой проверки ARCHIVED→PUBLISHED
  // проходил бы напрямую через обычное сохранение черновика, минуя вообще
  // любую проверку модерации/видимости (см. отчёт QA). Явной функциональности
  // "вернуть из архива" сегодня нет ни в одном UI — если понадобится, это
  // отдельная, осознанная операция, а не побочный эффект обычного save.
  if (existing && existing.status === "ARCHIVED") {
    throw new EventForbiddenError("event_archived");
  }

  const autoApprove = shouldAutoApproveEvent(user, school);
  const startsAt = new Date(input.startsAt!);
  const endsAt = input.endsAt ? new Date(input.endsAt) : null;

  const { row: event, unpublishAuditNote } = await prisma.$transaction(async (tx) => {
    // QA BUG-001 — заполняется ниже, если событие снимается с публикации;
    // logModeration зовётся ПОСЛЕ commit'а транзакции (тот же порядок, что и
    // в api/moderation/events/[id]/route.ts — тот тоже логирует отдельным
    // вызовом после $transaction, не внутри неё), поэтому наружу отдаём
    // просто данные, а не сам вызов.
    let unpublishAuditNote: { eventId: string; activeRegistrations: number } | null = null;
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
      certainty: input.certainty,
    };

    // Уведомления Event Engine (Notification & Subscription Engine, Phase 6):
    // "опубликовано" — это именно момент, когда событие становится РЕАЛЬНО
    // видимым (status=PUBLISHED И moderationStatus=APPROVED, см.
    // activeEventFilter() в src/lib/events.ts и гейт на /events/[slug]) — не
    // просто смена status у ещё не прошедшего модерацию события. Если
    // autoApprove=false, PUBLISHED уходит в очередь модерации и уведомление
    // отправится позже, из PATCH /api/moderation/events/[id] (там же, где
    // moderationStatus реально становится APPROVED).
    let row;
    let notifyPublished = false;
    let notifyUpdatedFields: string[] | null = null;

    if (existing) {
      const movingDraftToPublished = existing.status === "DRAFT" && input.status === "PUBLISHED";
      // QA BUG-002: republish после явного REJECTED не должен тихо обходить
      // решение модератора через auto-approve — organizer мог бы: сохранить
      // отклонённое PUBLISHED-событие как DRAFT (см. BUG-001), затем сразу
      // опубликовать снова, и verified-organizer auto-approve пропускал бы
      // его без единого нового review, да ещё с искажённой атрибуцией
      // (moderatedById оставался указывать на админа, который его отклонил).
      // Явный REJECTED всегда требует нового человеческого решения — auto-
      // approve рассчитан на "модератор ещё не видел контент", а не на
      // "модератор его явно отклонил".
      const requiresReReview = movingDraftToPublished && existing.moderationStatus === "REJECTED";
      const willAutoApprove = movingDraftToPublished && autoApprove && !requiresReReview;
      // QA BUG-001: снятие с публикации живого (реально видимого) события —
      // не должно быть тихим. Полноценного AuditLog в Слое 1 нет (см.
      // audit_report.md), поэтому переиспользуем уже существующий
      // ModerationLog тем же способом, что и /api/moderation/events/[id] —
      // вызывается ПОСЛЕ транзакции (см. ниже), здесь только считаем флаг.
      const wasLiveAndVisible = existing.status === "PUBLISHED" && existing.moderationStatus === "APPROVED";
      const isUnpublishing = wasLiveAndVisible && input.status === "DRAFT";

      row = await tx.event.update({
        where: { id: existing.id },
        data: {
          ...base,
          // Отправка на модерацию/авто-approve происходит один раз, в момент
          // первого Publish — повторное сохранение уже опубликованного
          // события не должно тихо перезапускать модерацию заново.
          ...(movingDraftToPublished
            ? willAutoApprove
              ? // moderatedById явно очищается (не наследует старое значение
                // от предыдущего решения человека) — это автоматическое
                // системное решение, а не решение того админа, что стоял в
                // этом поле раньше (та самая искажённая атрибуция из BUG-002).
                { moderationStatus: "APPROVED" as const, moderatedAt: new Date(), moderatedById: null }
              : { moderationStatus: "PENDING" as const }
            : {}),
        },
      });

      notifyPublished = movingDraftToPublished && willAutoApprove;

      if (isUnpublishing) {
        const activeRegistrations = await tx.eventRegistration.count({
          where: { eventId: existing.id, status: { in: ["REGISTERED", "CONFIRMED", "WAITLIST"] } },
        });
        unpublishAuditNote = { eventId: existing.id, activeRegistrations };
      }

      // "Изменение" — только для события, которое УЖЕ было полностью живым
      // (не в момент его первой публикации выше) и только по полям, реально
      // значимым для подписчика (время/место), не по любому сохранению формы.
      if (wasLiveAndVisible && !movingDraftToPublished) {
        const changed: string[] = [];
        if (existing.startsAt.getTime() !== startsAt.getTime()) changed.push("startsAt");
        if (existing.venueName !== base.venueName) changed.push("venueName");
        if ((existing.venueAddress ?? null) !== base.venueAddress) changed.push("venueAddress");
        if (changed.length > 0) notifyUpdatedFields = changed;
      }
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

      notifyPublished = input.status === "PUBLISHED" && autoApprove;
    }

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
    } else if (notifyUpdatedFields) {
      await emitDomainEvent(tx, {
        type: "EVENT_UPDATED",
        payload: {
          entityId: row.id,
          eventSlug: row.slug,
          title: row.title,
          cityId: row.cityId,
          format: row.format,
          schoolId: row.schoolId,
          createdById: row.createdById,
          changedFields: notifyUpdatedFields,
        },
        // updatedAt в ключе — КАЖДОЕ значимое изменение это отдельное
        // событие (не то же самое, что EVENT_PUBLISHED, где повтор с тем же
        // ключом — намеренный no-op).
        idempotencyKey: `EVENT_UPDATED:${row.id}:${row.updatedAt.toISOString()}`,
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
      await tx.festivalDetails.deleteMany({ where: { eventId: row.id } });
      await tx.partyDetails.upsert({
        where: { eventId: row.id },
        create: { eventId: row.id, ...(input.party ?? {}) },
        update: { ...(input.party ?? {}) },
      });
    } else if (input.format === "MASTERCLASS") {
      await tx.partyDetails.deleteMany({ where: { eventId: row.id } });
      await tx.festivalDetails.deleteMany({ where: { eventId: row.id } });
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
    } else if (input.format === "FESTIVAL") {
      await tx.partyDetails.deleteMany({ where: { eventId: row.id } });
      await tx.masterclassDetails.deleteMany({ where: { eventId: row.id } });
      const details = await tx.festivalDetails.upsert({
        where: { eventId: row.id },
        create: { eventId: row.id },
        update: {},
      });
      await tx.eventProgramItem.deleteMany({ where: { festivalDetailsId: details.id } });
      if (input.festival?.programItems?.length) {
        await tx.eventProgramItem.createMany({
          data: input.festival.programItems.map((p, order) => ({
            festivalDetailsId: details.id,
            title: p.title,
            type: p.type,
            startTime: new Date(p.startTime),
            endTime: p.endTime ? new Date(p.endTime) : null,
            teacherId: p.teacherId || null,
            order,
          })),
        });
      }
    } else {
      await tx.partyDetails.deleteMany({ where: { eventId: row.id } });
      await tx.masterclassDetails.deleteMany({ where: { eventId: row.id } });
      await tx.festivalDetails.deleteMany({ where: { eventId: row.id } });
    }

    return { row, unpublishAuditNote };
  });

  if (unpublishAuditNote) {
    await logModeration(
      user,
      "EVENT",
      unpublishAuditNote.eventId,
      "unpublish",
      unpublishAuditNote.activeRegistrations > 0
        ? `Снято с публикации организатором, активных регистраций на момент снятия: ${unpublishAuditNote.activeRegistrations}`
        : "Снято с публикации организатором"
    );
  }

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

// Минимальная отмена события (Notification & Subscription Engine, Phase 6 —
// EVENT_CANCELLED не имел ни одного writer'а до этой задачи, см. аудит).
// Права — те же, что и у редактирования черновика (getEventDraftForEdit
// ниже): автор события или ADMIN, школа-владелец сама по себе прав не даёт
// (как и раньше в этом файле). НЕ трогает связанный JNJ Competition (если
// format=CONTEST) — жизненный цикл соревнования отдельный, движок слоя 3 не
// переписываем ради этой задачи.
export async function cancelEvent(eventId: string, user: User) {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw new EventNotFoundError();
  if (event.createdById !== user.id && user.role !== "ADMIN") throw new EventForbiddenError("forbidden");
  if (event.status === "ARCHIVED") return event; // идемпотентно — повторная отмена не ошибка

  // QA BUG-003: видимость события — status=PUBLISHED И moderationStatus=
  // APPROVED (тот же инвариант, что и activeEventFilter() в src/lib/events.ts
  // и гейт /events/[slug]) — раньше проверялся только status, поэтому отмена
  // ещё не одобренного модератором (PENDING) события слала EVENT_CANCELLED,
  // хотя его никто и не видел.
  const wasPublished = event.status === "PUBLISHED" && event.moderationStatus === "APPROVED";

  return prisma.$transaction(async (tx) => {
    const row = await tx.event.update({ where: { id: eventId }, data: { status: "ARCHIVED" } });

    // Уведомляем, только если событие реально было видимым — отмена ещё не
    // прошедшего модерацию черновика никому не была видна, сообщать не о чем.
    if (wasPublished) {
      await emitDomainEvent(tx, {
        type: "EVENT_CANCELLED",
        payload: {
          entityId: row.id,
          eventSlug: row.slug,
          title: row.title,
          cityId: row.cityId,
          format: row.format,
          schoolId: row.schoolId,
          createdById: row.createdById,
        },
        idempotencyKey: `EVENT_CANCELLED:${row.id}`,
      });
    }

    return row;
  });
}

export async function getEventDraftForEdit(eventId: string, user: User) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      city: true,
      school: true,
      partyDetails: true,
      masterclassDetails: { include: { sessions: { orderBy: { order: "asc" } } } },
      festivalDetails: { include: { programItems: { orderBy: { order: "asc" } } } },
      priceOptions: { orderBy: { order: "asc" } },
      media: { orderBy: { sortOrder: "asc" } },
      competition: true,
    },
  });
  if (!event) throw new EventNotFoundError();
  if (event.createdById !== user.id && user.role !== "ADMIN") throw new EventForbiddenError("forbidden");
  return event;
}
