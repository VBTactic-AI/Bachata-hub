import { z } from "zod";
import { recurrenceRuleSchema } from "./recurrence";

// Recurring Events — zod-схемы для API-роутов /api/event-templates,
// /api/event-series. Тот же принцип, что и src/server/events/schemas.ts:
// zod отвечает за форму/типы, бизнес-обязательность и права — в сервисах.

const FORMAT_VALUES = [
  "PARTY",
  "MASTERCLASS",
  "FESTIVAL",
  "CONTEST",
  "INTENSIVE",
  "SOCIAL",
  "OPEN_AIR",
  "PRACTICE",
  "OTHER",
] as const;
const LEVEL_VALUES = ["BEGINNER", "ALL_LEVELS", "ADVANCED"] as const;
const TICKETING_MODE_VALUES = ["UNSET", "FREE", "TICKETS", "PASSES", "TICKETS_AND_PASSES"] as const;
const CERTAINTY_VALUES = ["TENTATIVE", "CONFIRMED"] as const;
const PASS_TYPE_VALUES = ["FULL_PASS", "PARTY_PASS", "WORKSHOP_PASS", "DAY_PASS", "COMPETITION_PASS", "VIP_PASS", "FREE_PASS", "CUSTOM"] as const;
const TIME_RE = /^([0-1]?\d|2[0-3]):[0-5]\d$/;

// Наследование тикетов/Pass шаблоном (2026-09-16) — те же "содержательные"
// поля, что и у TicketType/Pass, без дат продаж/valid-периодов и без
// soldQuantity/status/sortOrder/isActive (см. комментарий у
// EventTemplate.ticketTypes/passes, schema.prisma).
export const eventTemplateTicketTypeSchema = z.object({
  name: z.string().min(1).max(160),
  description: z.string().max(2000).optional().nullable(),
  price: z.number().nonnegative().optional().nullable(),
  currency: z.string().max(8).optional().nullable(),
  quantity: z.number().int().positive().optional().nullable(),
});
export const eventTemplatePassSchema = z.object({
  name: z.string().min(1).max(160),
  description: z.string().max(2000).optional().nullable(),
  type: z.enum(PASS_TYPE_VALUES),
  price: z.number().nonnegative().optional().nullable(),
  currency: z.string().max(8).optional().nullable(),
  quantity: z.number().int().positive().optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  allowMultipleEntry: z.boolean().optional(),
});

export const eventTemplateCreateSchema = z.object({
  name: z.string().min(1).max(160),
  description: z.string().max(4000).optional().nullable(),
  format: z.enum(FORMAT_VALUES),
  level: z.enum(LEVEL_VALUES).optional(),
  schoolId: z.string().optional().nullable(),
  cityId: z.string().optional().nullable(),
  venueName: z.string().max(200).optional().nullable(),
  venueAddress: z.string().max(300).optional().nullable(),
  defaultStartTime: z.string().regex(TIME_RE).optional().nullable(),
  defaultEndTime: z.string().regex(TIME_RE).optional().nullable(),
  ticketingMode: z.enum(TICKETING_MODE_VALUES).optional(),
  registrationEnabled: z.boolean().optional(),
  capacity: z.number().int().positive().optional().nullable(),
  priceText: z.string().max(120).optional().nullable(),
  externalLinkUrl: z.string().url().optional().or(z.literal("")).nullable(),
  tags: z.array(z.string()).optional(),
  certainty: z.enum(CERTAINTY_VALUES).optional(),
  photoUrl: z.string().optional().nullable(),
  typeDetails: z.unknown().optional(),
  ticketTypes: z.array(eventTemplateTicketTypeSchema).optional(),
  passes: z.array(eventTemplatePassSchema).optional(),
});
export const eventTemplatePatchSchema = eventTemplateCreateSchema.partial();

export const eventSeriesDefaultsSchema = {
  name: z.string().min(1).max(160),
  description: z.string().max(4000).optional().nullable(),
  level: z.enum(LEVEL_VALUES).optional(),
  schoolId: z.string().optional().nullable(),
  organizerName: z.string().max(200).optional().nullable(),
  cityId: z.string().min(1),
  venueName: z.string().min(1).max(200),
  venueAddress: z.string().max(300).optional().nullable(),
  ticketingMode: z.enum(TICKETING_MODE_VALUES).optional(),
  registrationEnabled: z.boolean().optional(),
  capacity: z.number().int().positive().optional().nullable(),
  priceText: z.string().max(120).optional().nullable(),
  externalLinkUrl: z.string().url().optional().or(z.literal("")).nullable(),
  tags: z.array(z.string()).optional(),
  certainty: z.enum(CERTAINTY_VALUES).optional(),
  photoUrl: z.string().optional().nullable(),
  typeDetails: z.unknown().optional(),
};

// "Сделать регулярным" (задача "Event Creation Engine — регулярность как
// опция публикации") — серия заводится ИЗ уже созданного Event
// (POST /api/event-drafts/[id]/make-recurring), поэтому здесь нет
// name/format/cityId/venueName и т.п. — они копируются на сервере из самого
// Event (см. createSeriesFromEvent в event-series-service.ts). Только то,
// что реально спрашивается в отдельном шаге "Повторение" мастера.
export const seriesFromEventSchema = z.object({
  timezone: z.string().max(64).optional(),
  recurrenceRule: recurrenceRuleSchema,
  endDate: z.string().min(8).optional().nullable(),
  generationHorizonDays: z.number().int().min(1).max(366).optional(),
  generationThresholdDays: z.number().int().min(0).max(366).optional(),
  autoPublish: z.boolean().optional(),
  publishDaysBefore: z.number().int().min(0).max(366).optional().nullable(),
  publishAtTime: z.string().regex(TIME_RE).optional().nullable(),
});

// "Сохранить как шаблон" — тоже из уже созданного Event
// (POST /api/event-drafts/[id]/save-as-template), единственный вход —
// необязательное имя шаблона (по умолчанию берётся название события).
export const saveEventAsTemplateSchema = z.object({
  name: z.string().max(160).optional(),
});

// PATCH — без format/templateId (неизменяемы после создания, см. комментарий
// в event-series-service.ts) и без status (переход статуса — только через
// выделенные /pause /resume /activate /archive, CLAUDE.md §45).
export const eventSeriesPatchSchema = z
  .object({
    ...eventSeriesDefaultsSchema,
    timezone: z.string().max(64).optional(),
    recurrenceRule: recurrenceRuleSchema.optional(),
    defaultStartTime: z.string().regex(TIME_RE).optional(),
    defaultEndTime: z.string().regex(TIME_RE).optional().nullable(),
    startDate: z.string().min(8).optional(),
    endDate: z.string().min(8).optional().nullable(),
    generationHorizonDays: z.number().int().min(1).max(366).optional(),
    generationThresholdDays: z.number().int().min(0).max(366).optional(),
    autoPublish: z.boolean().optional(),
    publishDaysBefore: z.number().int().min(0).max(366).optional().nullable(),
    publishAtTime: z.string().regex(TIME_RE).optional().nullable(),
  })
  .partial();

// "Это и следующие" / "Вся серия" — задача §9/§10.
export const seriesApplySchema = z.object({
  mode: z.enum(["FOLLOWING", "ALL"]),
  // Обязательно для FOLLOWING (с какого occurrence считать "следующими") —
  // проверяется в роуте, не в zod (зависит от mode, не выражается одной схемой без .refine).
  sinceOccurrenceDate: z.string().optional(),
  patch: z.object({
    name: z.string().min(1).max(160).optional(),
    description: z.string().max(4000).optional().nullable(),
    venueName: z.string().min(1).max(200).optional(),
    venueAddress: z.string().max(300).optional().nullable(),
    cityId: z.string().optional(),
    ticketingMode: z.enum(TICKETING_MODE_VALUES).optional(),
    registrationEnabled: z.boolean().optional(),
    capacity: z.number().int().positive().optional().nullable(),
    priceText: z.string().max(120).optional().nullable(),
    externalLinkUrl: z.string().url().optional().or(z.literal("")).nullable(),
    tags: z.array(z.string()).optional(),
    certainty: z.enum(CERTAINTY_VALUES).optional(),
    photoUrl: z.string().optional().nullable(),
    defaultStartTime: z.string().regex(TIME_RE).optional(),
    defaultEndTime: z.string().regex(TIME_RE).optional().nullable(),
  }),
});
