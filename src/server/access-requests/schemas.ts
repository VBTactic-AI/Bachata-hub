import { z } from "zod";

// Access Request Engine — единая заявка на проверенный доступ (заменяет
// SchoolClaim). Одна анкета "Стать организатором" (/become-organizer) может
// сразу отметить несколько типов — на выходе создаётся по одному
// AccessRequest на каждый отмеченный тип (см. src/server/access-requests/submit.ts),
// чтобы супер-админ мог решать по каждому независимо.

export const ACCESS_REQUEST_TYPES = [
  "EVENT_ORGANIZER",
  "FESTIVAL_ORGANIZER",
  "SCHOOL_HEAD",
  "COMPETITION_ORGANIZER",
] as const;
export const accessRequestTypeSchema = z.enum(ACCESS_REQUEST_TYPES);
export type AccessRequestTypeValue = (typeof ACCESS_REQUEST_TYPES)[number];

const linkTypeSchema = z.enum(["INSTAGRAM", "FACEBOOK", "WEBSITE", "TELEGRAM", "OTHER"]);
const linkSchema = z.object({ type: linkTypeSchema, url: z.string().min(1).max(300) });
export type AccessRequestLink = z.infer<typeof linkSchema>;

// Общие поля анкеты — одинаковые для всех типов. cityId/countryId обязательны
// на уровне валидации (не в схеме БД — там nullable для гибкости будущих
// правок), т.к. пользователь явно назвал их частью обязательного MVP-набора.
const commonFieldsSchema = {
  brandName: z.string().min(1).max(120),
  description: z.string().min(1).max(500),
  cityId: z.string().min(1),
  countryId: z.string().min(1),
  phone: z.string().max(40).optional(),
  links: z.array(linkSchema).min(1).max(10),
};

const experienceSchema = z.enum(["NEW", "UNDER_1Y", "1_3Y", "3Y_PLUS"]);

export const eventOrganizerPayloadSchema = z.object({
  eventTypes: z.array(z.enum(["PARTY", "WORKSHOP", "OPEN_AIR", "SOCIALS", "COMPETITIONS", "OTHER"])).min(1),
  experience: experienceSchema,
  exampleUrl: z.string().max(300).optional(),
});
export type EventOrganizerPayload = z.infer<typeof eventOrganizerPayloadSchema>;

export const festivalOrganizerPayloadSchema = z.object({
  festivalName: z.string().min(1).max(150),
  url: z.string().max(300).optional(),
  frequency: z.enum(["FIRST", "ANNUAL", "MULTIPLE", "OTHER"]),
  scale: z.enum(["UP_TO_100", "100_300", "300_500", "500_PLUS"]),
  formats: z.array(z.enum(["WORKSHOPS", "PARTIES", "COMPETITIONS", "SHOWS", "SOCIALS", "GUEST_TEACHERS"])).min(1),
  pastFestivalUrl: z.string().max(300).optional(),
});
export type FestivalOrganizerPayload = z.infer<typeof festivalOrganizerPayloadSchema>;

export const schoolHeadPayloadSchema = z.object({
  schoolName: z.string().min(1).max(150),
  website: z.string().max(300).optional(),
  instagram: z.string().max(300).optional(),
  teachingStyles: z.array(z.string().min(1).max(40)).min(1),
  teachersCount: z.enum(["1", "2_5", "6_10", "10_PLUS"]),
  hasRegularClasses: z.boolean(),
  address: z.string().max(300).optional(),
  // Заполняется сервером при одобрении (см. review.ts) — id реально
  // созданной/привязанной School, чтобы revoke() знал, у какой именно
  // школы отвязать владельца (пользователь может иметь несколько заявок).
  resolvedSchoolId: z.string().optional(),
});
export type SchoolHeadPayload = z.infer<typeof schoolHeadPayloadSchema>;

export const competitionOrganizerPayloadSchema = z.object({
  formats: z.array(z.string().min(1).max(60)).min(1),
  experience: experienceSchema,
  exampleUrl: z.string().max(300).optional(),
});
export type CompetitionOrganizerPayload = z.infer<typeof competitionOrganizerPayloadSchema>;

export const PAYLOAD_SCHEMA_BY_TYPE = {
  EVENT_ORGANIZER: eventOrganizerPayloadSchema,
  FESTIVAL_ORGANIZER: festivalOrganizerPayloadSchema,
  SCHOOL_HEAD: schoolHeadPayloadSchema,
  COMPETITION_ORGANIZER: competitionOrganizerPayloadSchema,
} as const;

export const submitAccessRequestSchema = z.object({
  types: z.array(accessRequestTypeSchema).min(1),
  ...commonFieldsSchema,
  // Валидируется по каждому type отдельно через PAYLOAD_SCHEMA_BY_TYPE
  // (submit.ts) — здесь намеренно z.record(..., z.unknown()), а не z.any(),
  // чтобы не потерять типовую проверку при построении объекта на клиенте.
  payloadByType: z.record(accessRequestTypeSchema, z.unknown()),
  confirmedAccurate: z.literal(true),
});
export type SubmitAccessRequestInput = z.infer<typeof submitAccessRequestSchema>;

export const reviewActionSchema = z.object({
  action: z.enum(["approve", "reject", "needs_info"]),
  comment: z.string().max(1000).optional(),
  // Только для SCHOOL_HEAD + approve: привязать к уже существующей
  // community-карточке школы вместо создания новой (см. review.ts).
  linkToSchoolId: z.string().optional(),
});
export type ReviewActionInput = z.infer<typeof reviewActionSchema>;

export const revokeActionSchema = z.object({
  reason: z.string().min(1).max(1000),
});
