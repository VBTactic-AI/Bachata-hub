import type { Event, EventSeries, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recurrenceRuleSchema, zonedDateParts, formatHhMm, dateOnlyUtc, type RecurrenceRule } from "./recurrence";

// EventSeries — регулярное событие (Recurring Events, 2026-09-16). RBAC —
// тот же паттерн, что и Event/EventTemplate: владелец (createdById) или
// ADMIN. Сознательно БЕЗ расширения через EventTeamMember (команда
// назначается на конкретное Event, не на серию, распространяющуюся на много
// событий сразу — отдельная, не запрошенная в задаче семантика, не выдумываю
// её здесь).

export class EventSeriesForbiddenError extends Error {
  constructor(public code: string = "forbidden") {
    super(code);
  }
}
export class EventSeriesNotFoundError extends Error {}
export class EventSeriesValidationError extends Error {
  constructor(
    public code: string,
    message?: string
  ) {
    super(message ?? code);
  }
}

function canManageSeries(series: { createdById: string }, user: User): boolean {
  return series.createdById === user.id || user.role === "ADMIN";
}

async function assertSchoolAccess(schoolId: string | null | undefined, user: User) {
  if (!schoolId) return;
  const school = await prisma.school.findUnique({ where: { id: schoolId } });
  if (!school || (user.role === "SCHOOL_REP" && school.ownerUserId !== user.id)) {
    throw new EventSeriesForbiddenError("forbidden_school");
  }
}

// Общие "дефолтные" поля события, которыми управляет и EventTemplate, и
// EventSeries, и (частично) сам сгенерированный Event — один тип, чтобы не
// рассинхронизировать три копии одного и того же списка полей.
export type SeriesDefaultsInput = {
  name: string;
  description?: string | null;
  format: EventSeries["format"];
  level?: EventSeries["level"];
  schoolId?: string | null;
  organizerName?: string | null;
  cityId: string;
  venueName: string;
  venueAddress?: string | null;
  ticketingMode?: EventSeries["ticketingMode"];
  registrationEnabled?: boolean;
  capacity?: number | null;
  priceText?: string | null;
  externalLinkUrl?: string | null;
  tags?: string[];
  certainty?: EventSeries["certainty"];
  photoUrl?: string | null;
  typeDetails?: unknown;
};

export type EventSeriesInput = SeriesDefaultsInput & {
  templateId?: string | null;
  timezone?: string;
  recurrenceRule: RecurrenceRule;
  defaultStartTime: string;
  defaultEndTime?: string | null;
  startDate: string; // "YYYY-MM-DD"
  endDate?: string | null;
  generationHorizonDays?: number;
  generationThresholdDays?: number;
  autoPublish?: boolean;
  // "За сколько дней и в какое время публиковать" (не "за N минут до старта"
  // единым числом — иначе публикация могла бы случайно попасть на 3 часа
  // ночи, по прямому запросу пользователя). 0 = в день самого события.
  publishDaysBefore?: number | null;
  publishAtTime?: string | null; // "HH:mm"
  status?: EventSeries["status"];
};

const TIME_RE = /^([0-1]?\d|2[0-3]):[0-5]\d$/;

function toDateOnlyUtc(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) throw new EventSeriesValidationError("invalid_date", `Некорректная дата: "${value}"`);
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

function validateCommon(input: {
  name?: string;
  defaultStartTime?: string | null;
  defaultEndTime?: string | null;
  capacity?: number | null;
  generationHorizonDays?: number;
  generationThresholdDays?: number;
  autoPublish?: boolean;
  publishDaysBefore?: number | null;
  publishAtTime?: string | null;
}) {
  if (input.name !== undefined && !input.name.trim()) {
    throw new EventSeriesValidationError("name_required", "Название серии обязательно.");
  }
  if (input.defaultStartTime !== undefined && input.defaultStartTime && !TIME_RE.test(input.defaultStartTime)) {
    throw new EventSeriesValidationError("invalid_time", "Некорректное время начала.");
  }
  if (input.defaultEndTime !== undefined && input.defaultEndTime && !TIME_RE.test(input.defaultEndTime)) {
    throw new EventSeriesValidationError("invalid_time", "Некорректное время окончания.");
  }
  if (input.capacity != null && (!Number.isInteger(input.capacity) || input.capacity <= 0)) {
    throw new EventSeriesValidationError("invalid_capacity", "Вместимость должна быть положительным целым числом.");
  }
  if (input.generationHorizonDays != null && (input.generationHorizonDays < 1 || input.generationHorizonDays > 366)) {
    throw new EventSeriesValidationError("invalid_horizon", "Горизонт генерации должен быть от 1 до 366 дней.");
  }
  if (input.generationThresholdDays != null && input.generationThresholdDays < 0) {
    throw new EventSeriesValidationError("invalid_threshold", "Порог генерации не может быть отрицательным.");
  }
  if (input.autoPublish) {
    if (input.publishDaysBefore == null || input.publishDaysBefore < 0) {
      throw new EventSeriesValidationError("publish_days_before_required", "При включённой автопубликации укажите, за сколько дней публиковать.");
    }
    if (!input.publishAtTime || !TIME_RE.test(input.publishAtTime)) {
      throw new EventSeriesValidationError("publish_at_time_required", "При включённой автопубликации укажите время публикации.");
    }
  }
}

// Recurring Events v2 (по прямому запросу пользователя, "Event Creation
// Engine — регулярность как опция публикации") — серия больше НЕ заводится
// отдельной формой с нуля. Организатор сначала обычным образом создаёт/
// публикует Event через event-service.ts, и уже ПОТОМ, на шаге "Публикация",
// отмечает "Сделать регулярным" — этот самый Event становится occurrence №1
// новой серии (его название/место/город/билеты и т.д. копируются как
// дефолты серии), а не заводится вторым, отдельным черновиком. Свободная
// форма "создать серию с нуля" (все поля вручную, включая название/место)
// больше не существует — только этот путь.
export type SeriesFromEventInput = {
  timezone?: string; // default "Europe/Minsk" — у Event своего поля timezone нет, см. recurrence.ts
  recurrenceRule: RecurrenceRule;
  endDate?: string | null; // "YYYY-MM-DD", null/undefined = бессрочно
  generationHorizonDays?: number;
  generationThresholdDays?: number;
  autoPublish?: boolean;
  publishDaysBefore?: number | null;
  publishAtTime?: string | null;
};

export async function createSeriesFromEvent(eventId: string, user: User, input: SeriesFromEventInput): Promise<EventSeries> {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw new EventSeriesNotFoundError();
  if (event.createdById !== user.id && user.role !== "ADMIN") throw new EventSeriesForbiddenError("forbidden");
  if (event.seriesId) throw new EventSeriesValidationError("event_already_in_series", "Это событие уже принадлежит другой серии.");
  // См. комментарий у прежней проверки в createEventSeries (удалена вместе с
  // ней) — CONTEST заодно заводит JNJ Competition при обычном создании
  // Event, повторяющиеся соревнования такой интеграции пока не имеют.
  if (event.format === "CONTEST") {
    throw new EventSeriesValidationError("contest_not_supported", "Регулярные серии для формата «Конкурс (JNJ)» пока не поддерживаются.");
  }

  validateCommon({
    generationHorizonDays: input.generationHorizonDays,
    generationThresholdDays: input.generationThresholdDays,
    autoPublish: input.autoPublish,
    publishDaysBefore: input.publishDaysBefore,
    publishAtTime: input.publishAtTime,
  });

  const timezone = input.timezone?.trim() || "Europe/Minsk";
  const rule = recurrenceRuleSchema.parse(input.recurrenceRule);

  // Дата/время СЕРИИ выводятся из уже введённых дат/времени этого Event
  // (не спрашиваются заново — задача явно требует "маленькую настройку
  // повторения", без дублирования уже заполненных полей).
  const startParts = zonedDateParts(event.startsAt, timezone);
  const startDate = dateOnlyUtc(startParts.year, startParts.month, startParts.day);
  const defaultStartTime = formatHhMm(startParts.hours, startParts.minutes);
  const defaultEndTime = event.endsAt ? formatHhMm(zonedDateParts(event.endsAt, timezone).hours, zonedDateParts(event.endsAt, timezone).minutes) : null;

  const endDate = input.endDate ? toDateOnlyUtc(input.endDate) : null;
  if (endDate && endDate.getTime() < startDate.getTime()) {
    throw new EventSeriesValidationError("end_before_start", "Дата окончания серии раньше даты начала.");
  }

  return prisma.$transaction(async (tx) => {
    const series = await tx.eventSeries.create({
      data: {
        createdById: user.id,
        templateId: null,
        name: event.title,
        description: event.description,
        format: event.format,
        level: event.level,
        schoolId: event.schoolId,
        organizerName: event.organizerName,
        cityId: event.cityId,
        venueName: event.venueName,
        venueAddress: event.venueAddress,
        timezone,
        recurrenceRule: rule as never,
        defaultStartTime,
        defaultEndTime,
        startDate,
        endDate,
        generationHorizonDays: input.generationHorizonDays ?? 84,
        generationThresholdDays: input.generationThresholdDays ?? 28,
        autoPublish: input.autoPublish ?? false,
        publishDaysBefore: input.autoPublish ? (input.publishDaysBefore ?? 3) : null,
        publishAtTime: input.autoPublish ? (input.publishAtTime ?? "10:00") : null,
        ticketingMode: event.ticketingMode,
        registrationEnabled: event.registrationEnabled,
        capacity: event.capacity,
        priceText: event.priceText,
        externalLinkUrl: event.externalLinkUrl,
        tags: event.tags,
        certainty: event.certainty,
        photoUrl: event.photoUrl,
        status: "ACTIVE",
        // Курсор генератора сразу указывает на дату ЭТОГО события — иначе
        // следующий тик cron попытался бы (и, по unique-констрейнту, не
        // смог бы, но лишняя попытка/шум в логах) сгенерировать occurrence
        // на ту же дату повторно. См. series-generation.ts.
        lastGeneratedThrough: startDate,
        lastGeneratedAt: new Date(),
      },
    });

    await tx.event.update({ where: { id: event.id }, data: { seriesId: series.id, occurrenceDate: startDate } });

    return series;
  });
}

export async function listEventSeriesForUser(user: User, includeArchived = false): Promise<EventSeries[]> {
  return prisma.eventSeries.findMany({
    where: {
      ...(user.role === "ADMIN" ? {} : { createdById: user.id }),
      ...(includeArchived ? {} : { status: { not: "ARCHIVED" } }),
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getEventSeries(seriesId: string, user: User): Promise<EventSeries> {
  const series = await prisma.eventSeries.findUnique({ where: { id: seriesId } });
  if (!series) throw new EventSeriesNotFoundError();
  if (!canManageSeries(series, user)) throw new EventSeriesForbiddenError("forbidden");
  return series;
}

// Ближайшие/все occurrences серии — пагинация обязательна (задача §22, "не
// загружать все occurrences сразу").
export async function listSeriesOccurrences(
  seriesId: string,
  user: User,
  opts: { limit?: number; cursor?: string; includePast?: boolean } = {}
): Promise<{ items: Event[]; nextCursor: string | null }> {
  await getEventSeries(seriesId, user); // бросит, если нет доступа
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);

  const items = await prisma.event.findMany({
    where: {
      seriesId,
      ...(opts.includePast ? {} : { startsAt: { gte: new Date() } }),
    },
    orderBy: { occurrenceDate: "asc" },
    take: limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });

  const hasMore = items.length > limit;
  const page = hasMore ? items.slice(0, limit) : items;
  return { items: page, nextCursor: hasMore ? page[page.length - 1].id : null };
}

export async function updateEventSeries(seriesId: string, user: User, patch: Partial<EventSeriesInput>): Promise<EventSeries> {
  const series = await getEventSeries(seriesId, user);
  if (series.status === "ARCHIVED") throw new EventSeriesForbiddenError("series_archived");
  validateCommon({ ...patch, autoPublish: patch.autoPublish ?? series.autoPublish });
  if (patch.schoolId !== undefined) await assertSchoolAccess(patch.schoolId, user);
  const rule = patch.recurrenceRule ? recurrenceRuleSchema.parse(patch.recurrenceRule) : undefined;

  const startDate = patch.startDate !== undefined ? toDateOnlyUtc(patch.startDate) : undefined;
  const endDate = patch.endDate !== undefined ? (patch.endDate ? toDateOnlyUtc(patch.endDate) : null) : undefined;

  return prisma.eventSeries.update({
    where: { id: seriesId },
    data: {
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.description !== undefined ? { description: patch.description?.trim() || null } : {}),
      ...(patch.level !== undefined ? { level: patch.level } : {}),
      ...(patch.schoolId !== undefined ? { schoolId: patch.schoolId || null } : {}),
      ...(patch.organizerName !== undefined ? { organizerName: patch.organizerName?.trim() || null } : {}),
      ...(patch.cityId !== undefined ? { cityId: patch.cityId } : {}),
      ...(patch.venueName !== undefined ? { venueName: patch.venueName.trim() } : {}),
      ...(patch.venueAddress !== undefined ? { venueAddress: patch.venueAddress?.trim() || null } : {}),
      ...(patch.timezone !== undefined ? { timezone: patch.timezone.trim() } : {}),
      ...(rule ? { recurrenceRule: rule as never } : {}),
      ...(patch.defaultStartTime !== undefined ? { defaultStartTime: patch.defaultStartTime } : {}),
      ...(patch.defaultEndTime !== undefined ? { defaultEndTime: patch.defaultEndTime || null } : {}),
      ...(startDate ? { startDate } : {}),
      ...(endDate !== undefined ? { endDate } : {}),
      ...(patch.generationHorizonDays !== undefined ? { generationHorizonDays: patch.generationHorizonDays } : {}),
      ...(patch.generationThresholdDays !== undefined ? { generationThresholdDays: patch.generationThresholdDays } : {}),
      ...(patch.autoPublish !== undefined ? { autoPublish: patch.autoPublish } : {}),
      ...(patch.publishDaysBefore !== undefined ? { publishDaysBefore: patch.publishDaysBefore } : {}),
      ...(patch.publishAtTime !== undefined ? { publishAtTime: patch.publishAtTime } : {}),
      ...(patch.ticketingMode !== undefined ? { ticketingMode: patch.ticketingMode } : {}),
      ...(patch.registrationEnabled !== undefined ? { registrationEnabled: patch.registrationEnabled } : {}),
      ...(patch.capacity !== undefined ? { capacity: patch.capacity } : {}),
      ...(patch.priceText !== undefined ? { priceText: patch.priceText?.trim() || null } : {}),
      ...(patch.externalLinkUrl !== undefined ? { externalLinkUrl: patch.externalLinkUrl?.trim() || null } : {}),
      ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
      ...(patch.certainty !== undefined ? { certainty: patch.certainty } : {}),
      ...(patch.photoUrl !== undefined ? { photoUrl: patch.photoUrl?.trim() || null } : {}),
      ...(patch.typeDetails !== undefined ? { typeDetails: patch.typeDetails as never } : {}),
    },
  });
}

// --- Lifecycle (задача §12: Pause/Resume, §16: Архивировать) ---

export async function activateEventSeries(seriesId: string, user: User): Promise<EventSeries> {
  const series = await getEventSeries(seriesId, user);
  if (series.status !== "DRAFT") throw new EventSeriesForbiddenError("invalid_transition");
  return prisma.eventSeries.update({ where: { id: seriesId }, data: { status: "ACTIVE" } });
}

export async function pauseEventSeries(seriesId: string, user: User): Promise<EventSeries> {
  const series = await getEventSeries(seriesId, user);
  if (series.status !== "ACTIVE") throw new EventSeriesForbiddenError("invalid_transition");
  return prisma.eventSeries.update({ where: { id: seriesId }, data: { status: "PAUSED" } });
}

export async function resumeEventSeries(seriesId: string, user: User): Promise<EventSeries> {
  const series = await getEventSeries(seriesId, user);
  if (series.status !== "PAUSED") throw new EventSeriesForbiddenError("invalid_transition");
  return prisma.eventSeries.update({ where: { id: seriesId }, data: { status: "ACTIVE" } });
}

export async function archiveEventSeries(seriesId: string, user: User): Promise<EventSeries> {
  const series = await getEventSeries(seriesId, user);
  if (series.status === "ARCHIVED") return series; // идемпотентно
  // Будущие occurrences НЕ удаляются (задача §12) — архивация серии только
  // останавливает генерацию/автопубликацию, существующие Event не трогает.
  return prisma.eventSeries.update({ where: { id: seriesId }, data: { status: "ARCHIVED" } });
}

export async function duplicateEventSeries(seriesId: string, user: User, name?: string): Promise<EventSeries> {
  const series = await getEventSeries(seriesId, user);
  // Дубликат сознательно создаётся как DRAFT (не ACTIVE) — иначе он сразу
  // начал бы независимо генерировать occurrences на следующем тике cron,
  // что организатор скорее всего не ожидает сразу после клика "Дублировать".
  return prisma.eventSeries.create({
    data: {
      createdById: user.id,
      templateId: series.templateId,
      name: (name?.trim() || `${series.name} (копия)`).trim(),
      description: series.description,
      format: series.format,
      level: series.level,
      schoolId: series.schoolId,
      organizerName: series.organizerName,
      cityId: series.cityId,
      venueName: series.venueName,
      venueAddress: series.venueAddress,
      timezone: series.timezone,
      recurrenceRule: series.recurrenceRule as never,
      defaultStartTime: series.defaultStartTime,
      defaultEndTime: series.defaultEndTime,
      startDate: series.startDate,
      endDate: series.endDate,
      generationHorizonDays: series.generationHorizonDays,
      generationThresholdDays: series.generationThresholdDays,
      autoPublish: series.autoPublish,
      publishDaysBefore: series.publishDaysBefore,
      publishAtTime: series.publishAtTime,
      ticketingMode: series.ticketingMode,
      registrationEnabled: series.registrationEnabled,
      capacity: series.capacity,
      priceText: series.priceText,
      externalLinkUrl: series.externalLinkUrl,
      tags: series.tags,
      certainty: series.certainty,
      photoUrl: series.photoUrl,
      typeDetails: series.typeDetails as never,
      status: "DRAFT",
    },
  });
}

// --- "Это и следующие" / "Вся серия" (задача §9/§10) ---
//
// Один и тот же примитив для обоих режимов UI: "это и следующие" передаёт
// sinceOccurrenceDate = дата occurrence, с которого редактируют; "вся серия"
// вызывает без него. В ОБОИХ случаях уже прошедшие события (startsAt в
// прошлом) не трогаются никогда (CLAUDE.md §51 "не изменяй историю") и уже
// отменённые (ARCHIVED) occurrences не воскрешаются молча правкой серии.
export type SeriesApplyPatch = Partial<
  Pick<
    SeriesDefaultsInput,
    | "name"
    | "description"
    | "venueName"
    | "venueAddress"
    | "cityId"
    | "ticketingMode"
    | "registrationEnabled"
    | "capacity"
    | "priceText"
    | "externalLinkUrl"
    | "tags"
    | "certainty"
    | "photoUrl"
  >
> & {
  // Если заданы — пересчитываются startsAt/endsAt КАЖДОГО затронутого
  // occurrence по ЕГО СОБСТВЕННОЙ occurrenceDate (не общий сдвиг времени).
  defaultStartTime?: string;
  defaultEndTime?: string | null;
};

export async function applySeriesUpdate(
  seriesId: string,
  user: User,
  patch: SeriesApplyPatch,
  opts: { sinceOccurrenceDate?: Date } = {}
): Promise<{ seriesUpdated: EventSeries; occurrencesUpdated: number }> {
  const series = await getEventSeries(seriesId, user);
  if (series.status === "ARCHIVED") throw new EventSeriesForbiddenError("series_archived");
  validateCommon(patch);

  const { computeOccurrenceTimes } = await import("./recurrence");

  const seriesUpdated = await updateEventSeries(seriesId, user, patch as Partial<EventSeriesInput>);

  const affected = await prisma.event.findMany({
    where: {
      seriesId,
      status: { not: "ARCHIVED" },
      startsAt: { gt: new Date() },
      ...(opts.sinceOccurrenceDate ? { occurrenceDate: { gte: opts.sinceOccurrenceDate } } : {}),
    },
  });

  const timeChanged = patch.defaultStartTime !== undefined || patch.defaultEndTime !== undefined;
  let occurrencesUpdated = 0;

  for (const occurrence of affected) {
    const timeFields = timeChanged
      ? computeOccurrenceTimes(
          occurrence.occurrenceDate!,
          patch.defaultStartTime ?? seriesUpdated.defaultStartTime,
          patch.defaultEndTime !== undefined ? patch.defaultEndTime : seriesUpdated.defaultEndTime,
          seriesUpdated.timezone
        )
      : null;

    await prisma.event.update({
      where: { id: occurrence.id },
      data: {
        ...(patch.name !== undefined ? { title: patch.name.trim() } : {}),
        ...(patch.description !== undefined ? { description: patch.description?.trim() || null } : {}),
        ...(patch.venueName !== undefined ? { venueName: patch.venueName.trim() } : {}),
        ...(patch.venueAddress !== undefined ? { venueAddress: patch.venueAddress?.trim() || null } : {}),
        ...(patch.cityId !== undefined ? { cityId: patch.cityId } : {}),
        ...(patch.ticketingMode !== undefined ? { ticketingMode: patch.ticketingMode } : {}),
        ...(patch.registrationEnabled !== undefined ? { registrationEnabled: patch.registrationEnabled } : {}),
        ...(patch.capacity !== undefined ? { capacity: patch.capacity } : {}),
        ...(patch.priceText !== undefined ? { priceText: patch.priceText?.trim() || null } : {}),
        ...(patch.externalLinkUrl !== undefined ? { externalLinkUrl: patch.externalLinkUrl?.trim() || null } : {}),
        ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
        ...(patch.certainty !== undefined ? { certainty: patch.certainty } : {}),
        ...(patch.photoUrl !== undefined ? { photoUrl: patch.photoUrl?.trim() || null } : {}),
        ...(timeFields ? { startsAt: timeFields.startsAt, endsAt: timeFields.endsAt } : {}),
      },
    });
    occurrencesUpdated++;
  }

  return { seriesUpdated, occurrencesUpdated };
}
