import { z } from "zod";

// Event Engine — единая схема черновика/публикации события. Специально
// лениентная (почти всё optional): мастер сохраняет "Save Draft" с любым
// подмножеством заполненных шагов, полная проверка обязательных полей — это
// EventPublishChecklist (src/lib/events/event-type-registry.ts), а не zod, и
// выполняется отдельно ТОЛЬКО когда status: "PUBLISHED" (см. event-service.ts).
// Zod здесь отвечает за форму/типы данных, не за бизнес-обязательность.

export const eventPriceOptionSchema = z.object({
  label: z.string().min(1).max(80),
  price: z.coerce.number().nonnegative().optional(),
  currency: z.string().max(8).optional(),
});

export const masterclassSessionSchema = z.object({
  title: z.string().min(1).max(160),
  teacherId: z.string().optional(),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
  room: z.string().max(120).optional(),
  level: z.enum(["BEGINNER", "ALL_LEVELS", "ADVANCED"]).optional(),
  capacity: z.coerce.number().int().positive().optional(),
});

export const partyDetailsInputSchema = z.object({
  musicStyles: z.array(z.string().min(1)).optional(),
  djs: z.array(z.string().min(1)).optional(),
  danceFloors: z.array(z.string().min(1)).optional(),
  artists: z.array(z.string().min(1)).optional(),
  dressCode: z.string().max(200).optional(),
  photographer: z.string().max(200).optional(),
  foodAndDrinks: z.string().max(200).optional(),
  parking: z.boolean().optional(),
  cloakroom: z.boolean().optional(),
});

export const masterclassDetailsInputSchema = z.object({
  style: z.string().max(120).optional(),
  format: z.string().max(120).optional(),
  partnerRequired: z.boolean().optional(),
  sessions: z.array(masterclassSessionSchema).optional(),
});

export const eventDraftSchema = z.object({
  status: z.enum(["DRAFT", "PUBLISHED"]),
  format: z.enum(["PARTY", "MASTERCLASS", "FESTIVAL", "CONTEST", "INTENSIVE"]),
  title: z.string().max(160).optional(),
  description: z.string().max(4000).optional(),
  level: z.enum(["BEGINNER", "ALL_LEVELS", "ADVANCED"]).default("ALL_LEVELS"),
  cityId: z.string().optional(),
  schoolId: z.string().optional(),
  organizerName: z.string().max(200).optional(),
  venueName: z.string().max(200).optional(),
  venueAddress: z.string().max(300).optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  capacity: z.coerce.number().int().positive().optional(),
  registrationEnabled: z.boolean().optional(),
  priceText: z.string().max(120).optional(),
  externalLinkUrl: z.string().url().optional().or(z.literal("")),
  tags: z.array(z.string()).optional(),
  priceOptions: z.array(eventPriceOptionSchema).optional(),
  party: partyDetailsInputSchema.optional(),
  masterclass: masterclassDetailsInputSchema.optional(),
});
export type EventDraftInput = z.infer<typeof eventDraftSchema>;
