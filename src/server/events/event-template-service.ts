import type { EventTemplate, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { zonedDateParts, formatHhMm } from "./recurrence";

// EventTemplate — переиспользуемая заготовка настроек события (Recurring
// Events, 2026-09-16). По образцу PassTemplate (src/server/events/
// pass-template-service.ts): владелец = createdById, тот же bypass для
// ADMIN, физическое удаление (чистая конфигурация без исторической ценности,
// CLAUDE.md §18 не применим — в отличие от Event/Pass здесь нечего хранить
// как историю уже проведённых событий).

export class EventTemplateForbiddenError extends Error {
  constructor(public code: string = "forbidden") {
    super(code);
  }
}
export class EventTemplateNotFoundError extends Error {}
export class EventTemplateValidationError extends Error {
  constructor(
    public code: string,
    message?: string
  ) {
    super(message ?? code);
  }
}

function canManageTemplate(template: { createdById: string }, user: User): boolean {
  return template.createdById === user.id || user.role === "ADMIN";
}

export type EventTemplateInput = {
  name: string;
  description?: string | null;
  format: EventTemplate["format"];
  level?: EventTemplate["level"];
  schoolId?: string | null;
  cityId?: string | null;
  venueName?: string | null;
  venueAddress?: string | null;
  defaultStartTime?: string | null;
  defaultEndTime?: string | null;
  ticketingMode?: EventTemplate["ticketingMode"];
  registrationEnabled?: boolean;
  capacity?: number | null;
  priceText?: string | null;
  externalLinkUrl?: string | null;
  tags?: string[];
  certainty?: EventTemplate["certainty"];
  photoUrl?: string | null;
  typeDetails?: unknown;
};

function validateInput(input: Partial<EventTemplateInput>): void {
  if (input.name !== undefined && !input.name.trim()) {
    throw new EventTemplateValidationError("name_required", "Название шаблона обязательно.");
  }
  if (input.capacity != null && (!Number.isInteger(input.capacity) || input.capacity <= 0)) {
    throw new EventTemplateValidationError("invalid_capacity", "Вместимость должна быть положительным целым числом.");
  }
  for (const t of [input.defaultStartTime, input.defaultEndTime]) {
    if (t && !/^([0-1]?\d|2[0-3]):[0-5]\d$/.test(t)) {
      throw new EventTemplateValidationError("invalid_time", `Некорректное время: "${t}", ожидается "HH:mm".`);
    }
  }
}

async function assertSchoolAccess(schoolId: string | null | undefined, user: User) {
  if (!schoolId) return;
  const school = await prisma.school.findUnique({ where: { id: schoolId } });
  if (!school || (user.role === "SCHOOL_REP" && school.ownerUserId !== user.id)) {
    throw new EventTemplateForbiddenError("forbidden_school");
  }
}

// Recurring Events v2 (по прямому запросу пользователя) — шаблон, как и
// серия (см. createSeriesFromEvent в event-series-service.ts), больше не
// заводится пустой формой: организатор сохраняет как шаблон уже заполненное
// (черновик или опубликованное) событие на шаге "Публикация" мастера.
export async function createEventTemplateFromEvent(eventId: string, user: User, name?: string): Promise<EventTemplate> {
  const event = await prisma.event.findUnique({ where: { id: eventId }, include: { partyDetails: true } });
  if (!event) throw new EventTemplateNotFoundError();
  if (event.createdById !== user.id && user.role !== "ADMIN") throw new EventTemplateForbiddenError("forbidden");
  if (name !== undefined) validateInput({ name });

  // Время события — "HH:mm" в той же таймзоне по умолчанию, что и генератор
  // серий (см. комментарий у EventSeries.timezone) — Event своего поля
  // timezone не имеет.
  const timezone = "Europe/Minsk";
  const startParts = zonedDateParts(event.startsAt, timezone);
  const defaultStartTime = formatHhMm(startParts.hours, startParts.minutes);
  const defaultEndTime = event.endsAt ? formatHhMm(zonedDateParts(event.endsAt, timezone).hours, zonedDateParts(event.endsAt, timezone).minutes) : null;

  // Осознанное ограничение объёма: детали party (без дат/времени —
  // безопасно копировать как есть) снимаются в шаблон; сессии мастер-класса
  // и программа фестиваля НЕ снимаются — они завязаны на конкретные
  // датированные временные слоты исходного события, бездумно копировать их
  // в шаблон-заготовку (у которой ещё нет собственной даты) означало бы
  // либо угадывать смысл смещений, либо копировать заведомо неверные
  // абсолютные времена. Организатор донастраивает их вручную у события,
  // созданного из шаблона — как и раньше, до этой задачи.
  const typeDetails =
    event.format === "PARTY" && event.partyDetails
      ? {
          musicStyles: event.partyDetails.musicStyles,
          djs: event.partyDetails.djs,
          danceFloors: event.partyDetails.danceFloors,
          artists: event.partyDetails.artists,
          dressCode: event.partyDetails.dressCode,
          photographer: event.partyDetails.photographer,
          foodAndDrinks: event.partyDetails.foodAndDrinks,
          parking: event.partyDetails.parking,
          cloakroom: event.partyDetails.cloakroom,
        }
      : null;

  return prisma.eventTemplate.create({
    data: {
      createdById: user.id,
      name: (name?.trim() || event.title).trim(),
      description: event.description,
      format: event.format,
      level: event.level,
      schoolId: event.schoolId,
      cityId: event.cityId,
      venueName: event.venueName,
      venueAddress: event.venueAddress,
      defaultStartTime,
      defaultEndTime,
      ticketingMode: event.ticketingMode,
      registrationEnabled: event.registrationEnabled,
      capacity: event.capacity,
      priceText: event.priceText,
      externalLinkUrl: event.externalLinkUrl,
      tags: event.tags,
      certainty: event.certainty,
      photoUrl: event.photoUrl,
      typeDetails: (typeDetails ?? undefined) as never,
      status: "ACTIVE",
    },
  });
}

export async function listEventTemplatesForUser(user: User, includeArchived = false): Promise<EventTemplate[]> {
  return prisma.eventTemplate.findMany({
    where: {
      ...(user.role === "ADMIN" ? {} : { createdById: user.id }),
      ...(includeArchived ? {} : { status: "ACTIVE" }),
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getEventTemplate(templateId: string, user: User): Promise<EventTemplate> {
  const template = await prisma.eventTemplate.findUnique({ where: { id: templateId } });
  if (!template) throw new EventTemplateNotFoundError();
  if (!canManageTemplate(template, user)) throw new EventTemplateForbiddenError("forbidden");
  return template;
}

export async function updateEventTemplate(templateId: string, user: User, patch: Partial<EventTemplateInput>): Promise<EventTemplate> {
  const template = await prisma.eventTemplate.findUnique({ where: { id: templateId } });
  if (!template) throw new EventTemplateNotFoundError();
  if (!canManageTemplate(template, user)) throw new EventTemplateForbiddenError("forbidden");
  if (template.status === "ARCHIVED") throw new EventTemplateForbiddenError("template_archived");
  validateInput(patch);
  if (patch.schoolId !== undefined) await assertSchoolAccess(patch.schoolId, user);

  return prisma.eventTemplate.update({
    where: { id: templateId },
    data: {
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.description !== undefined ? { description: patch.description?.trim() || null } : {}),
      ...(patch.format !== undefined ? { format: patch.format } : {}),
      ...(patch.level !== undefined ? { level: patch.level } : {}),
      ...(patch.schoolId !== undefined ? { schoolId: patch.schoolId || null } : {}),
      ...(patch.cityId !== undefined ? { cityId: patch.cityId || null } : {}),
      ...(patch.venueName !== undefined ? { venueName: patch.venueName?.trim() || null } : {}),
      ...(patch.venueAddress !== undefined ? { venueAddress: patch.venueAddress?.trim() || null } : {}),
      ...(patch.defaultStartTime !== undefined ? { defaultStartTime: patch.defaultStartTime || null } : {}),
      ...(patch.defaultEndTime !== undefined ? { defaultEndTime: patch.defaultEndTime || null } : {}),
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

export async function archiveEventTemplate(templateId: string, user: User): Promise<EventTemplate> {
  const template = await prisma.eventTemplate.findUnique({ where: { id: templateId } });
  if (!template) throw new EventTemplateNotFoundError();
  if (!canManageTemplate(template, user)) throw new EventTemplateForbiddenError("forbidden");
  if (template.status === "ARCHIVED") return template; // идемпотентно
  return prisma.eventTemplate.update({ where: { id: templateId }, data: { status: "ARCHIVED" } });
}

export async function unarchiveEventTemplate(templateId: string, user: User): Promise<EventTemplate> {
  const template = await prisma.eventTemplate.findUnique({ where: { id: templateId } });
  if (!template) throw new EventTemplateNotFoundError();
  if (!canManageTemplate(template, user)) throw new EventTemplateForbiddenError("forbidden");
  if (template.status === "ACTIVE") return template;
  return prisma.eventTemplate.update({ where: { id: templateId }, data: { status: "ACTIVE" } });
}

export async function duplicateEventTemplate(templateId: string, user: User, name?: string): Promise<EventTemplate> {
  const template = await getEventTemplate(templateId, user);
  return prisma.eventTemplate.create({
    data: {
      createdById: user.id,
      name: (name?.trim() || `${template.name} (копия)`).trim(),
      description: template.description,
      format: template.format,
      level: template.level,
      schoolId: template.schoolId,
      cityId: template.cityId,
      venueName: template.venueName,
      venueAddress: template.venueAddress,
      defaultStartTime: template.defaultStartTime,
      defaultEndTime: template.defaultEndTime,
      ticketingMode: template.ticketingMode,
      registrationEnabled: template.registrationEnabled,
      capacity: template.capacity,
      priceText: template.priceText,
      externalLinkUrl: template.externalLinkUrl,
      tags: template.tags,
      certainty: template.certainty,
      photoUrl: template.photoUrl,
      typeDetails: template.typeDetails as never,
    },
  });
}
