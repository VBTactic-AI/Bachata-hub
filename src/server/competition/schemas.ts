import { z } from "zod";

export const createCompetitionSchema = z.object({
  name: z.string().min(3).max(200),
  description: z.string().max(2000).optional(),
  organizerName: z.string().max(200).optional(),
  venue: z.string().max(200).optional(),
  cityId: z.string().optional(),
  timezone: z.string().min(1).default("Europe/Minsk"),
  startAt: z.coerce.date().optional(),
  endAt: z.coerce.date().optional(),
  eventId: z.string().optional(),
});
export type CreateCompetitionInput = z.infer<typeof createCompetitionSchema>;

export const addDivisionSchema = z.object({
  categoryId: z.string().min(1),
  minAge: z.coerce.number().int().positive().optional(),
  maxAge: z.coerce.number().int().positive().optional(),
  maxParticipants: z.coerce.number().int().positive().optional(),
  // Вместимость заезда (пар одновременно на паркете) — используется при
  // авто-генерации раундов/заездов. Необязательно — если не задать, в базе
  // используется значение по умолчанию (docs/00_DECISIONS.md, A7).
  heatCapacity: z.coerce.number().int().positive().optional(),
  rules: z.record(z.unknown()).default({}),
});
export type AddDivisionInput = z.infer<typeof addDivisionSchema>;

export const createDivisionCategorySchema = z.object({
  name: z.string().min(1).max(100),
});
export type CreateDivisionCategoryInput = z.infer<typeof createDivisionCategorySchema>;

export const createRoundStageSchema = z.object({
  name: z.string().min(1).max(100),
  defaultAdvanceCount: z.coerce.number().int().positive(),
});
export type CreateRoundStageInput = z.infer<typeof createRoundStageSchema>;

// Все поля необязательны по отдельности (можно поменять только isActive,
// только название, или всё сразу) — но хотя бы одно обязано присутствовать.
export const updateRoundStageSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    defaultAdvanceCount: z.coerce.number().int().positive().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => v.name !== undefined || v.defaultAdvanceCount !== undefined || v.isActive !== undefined, {
    message: "Нужно указать хотя бы одно поле для изменения.",
  });
export type UpdateRoundStageInput = z.infer<typeof updateRoundStageSchema>;

export const changeRegistrationDivisionSchema = z.object({
  divisionId: z.string().min(1),
  reason: z.string().max(500).optional(),
});
export type ChangeRegistrationDivisionInput = z.infer<typeof changeRegistrationDivisionSchema>;

export const setRulesSchema = z.object({
  rules: z.record(z.unknown()),
});
export type SetRulesInput = z.infer<typeof setRulesSchema>;

export const competitionStatusSchema = z.enum([
  "DRAFT",
  "REGISTRATION_OPEN",
  "REGISTRATION_CLOSED",
  "CHECK_IN",
  "READY",
  "LIVE",
  "SCORING",
  "REVIEW",
  "PUBLISHED",
  "ARCHIVED",
]);

export const transitionCompetitionSchema = z.object({
  to: competitionStatusSchema,
  reason: z.string().max(500).optional(),
});
export type TransitionCompetitionInput = z.infer<typeof transitionCompetitionSchema>;

// Раунд теперь всегда ссылается на этап из общего справочника
// (RoundStageCatalog) — свободного названия/типа больше нет
// (docs/00_DECISIONS.md, A7). TIE_BREAK/DANCE_OFF создаёт сам Advancement
// Engine (Этап 8), через этот эндпоинт недоступны.
export const createRoundSchema = z.object({
  stageId: z.string().min(1),
  finalistsCount: z.coerce.number().int().positive(),
  heatCapacity: z.coerce.number().int().positive().optional(),
});
export type CreateRoundInput = z.infer<typeof createRoundSchema>;

export const generateRoundsSchema = z.object({}).default({});
export type GenerateRoundsInput = z.infer<typeof generateRoundsSchema>;

export const roundStatusSchema = z.enum([
  "DRAFT",
  "READY",
  "DRAWING",
  "DRAW_LOCKED",
  "RUNNING",
  "PAUSED",
  "FINISHED",
  "SCORING",
  "COMPLETED",
]);

export const transitionRoundSchema = z.object({
  to: roundStatusSchema,
  reason: z.string().max(500).optional(),
});
export type TransitionRoundInput = z.infer<typeof transitionRoundSchema>;

export const heatStatusSchema = z.enum(["PENDING", "RUNNING", "PAUSED", "FINISHED"]);

export const transitionHeatSchema = z.object({
  to: heatStatusSchema,
  reason: z.string().max(500).optional(),
});
export type TransitionHeatInput = z.infer<typeof transitionHeatSchema>;
