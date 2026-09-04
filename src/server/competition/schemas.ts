import { z } from "zod";
import { registrationRoleSchema } from "./registration-schemas";

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

// Режим ротации партнёров дивизиона по умолчанию (Этап 6, docs/00_DECISIONS.md,
// A12) — два независимых сценария, не переключатели одного: TRACK_AUTO_SHIFT
// (смены внутри трека по таймеру) и SEGMENT_MANUAL_SHIFT (DJ вручную
// останавливает отрезок, затем выбирается число партнёров для перехода).
export const rotationModeSchema = z.enum(["TRACK_AUTO_SHIFT", "SEGMENT_MANUAL_SHIFT"]);

// Сколько пар участвует в каждом этапе — задаётся ОДИН РАЗ при создании
// дивизиона, до начала соревнования, дальше не меняется (docs/00_DECISIONS.md,
// A14): это исходные данные для расчёта cutoff в Advancement Engine.
export const divisionStagePlanEntrySchema = z.object({
  stageId: z.string().min(1),
  participantCount: z.coerce.number().int().positive(),
});

export const addDivisionSchema = z.object({
  categoryId: z.string().min(1),
  minAge: z.coerce.number().int().positive().optional(),
  maxAge: z.coerce.number().int().positive().optional(),
  maxParticipants: z.coerce.number().int().positive().optional(),
  // Вместимость заезда (пар одновременно на паркете) — используется при
  // авто-генерации раундов/заездов. Необязательно — если не задать, в базе
  // используется значение по умолчанию (docs/00_DECISIONS.md, A7).
  heatCapacity: z.coerce.number().int().positive().optional(),
  rotationMode: rotationModeSchema.optional(),
  rotationIntervalSec: z.coerce.number().int().positive().optional(),
  rotationShiftMin: z.coerce.number().int().positive().optional(),
  rotationShiftMax: z.coerce.number().int().positive().optional(),
  stagePlan: z.array(divisionStagePlanEntrySchema).default([]),
  rules: z.record(z.unknown()).default({}),
});
export type AddDivisionInput = z.infer<typeof addDivisionSchema>;

// Изменение вместимости/ротации уже созданного дивизиона — отдельно от
// создания (по запросу пользователя, 2026-09-04): категория не меняется
// здесь (для этого — смена дивизиона у конкретной регистрации,
// change-registration-division.ts, другой смысл).
export const updateDivisionSettingsSchema = z.object({
  heatCapacity: z.coerce.number().int().positive(),
  rotationMode: rotationModeSchema,
  rotationIntervalSec: z.coerce.number().int().positive(),
  rotationShiftMin: z.coerce.number().int().positive(),
  rotationShiftMax: z.coerce.number().int().positive(),
});
export type UpdateDivisionSettingsInput = z.infer<typeof updateDivisionSettingsSchema>;

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

// --- Draw Engine (Этап 5, docs/00_DECISIONS.md A5/A6) ---

export const callOrderSchema = z.enum(["SEQUENTIAL", "RANDOM"]);

export const startDrawingSchema = z.object({
  callOrder: callOrderSchema,
});
export type StartDrawingInput = z.infer<typeof startDrawingSchema>;

export const rerollDrawSchema = z.object({
  reason: z.string().min(1).max(500),
});
export type RerollDrawInput = z.infer<typeof rerollDrawSchema>;

export const addDrawHelperSchema = z.object({
  registrationId: z.string().min(1),
  role: registrationRoleSchema,
});
export type AddDrawHelperInput = z.infer<typeof addDrawHelperSchema>;

export const replaceDrawHelperSchema = z.object({
  registrationId: z.string().min(1),
});
export type ReplaceDrawHelperInput = z.infer<typeof replaceDrawHelperSchema>;

// --- Живой танцпол / ротация партнёров (Этап 6, docs/00_DECISIONS.md A12) ---

export const nextTrackSchema = z.object({
  trackName: z.string().max(200).optional(),
});
export type NextTrackInput = z.infer<typeof nextTrackSchema>;

export const shiftSourceSchema = z.enum(["RANDOM", "MANUAL"]);

export const chooseShiftSchema = z
  .object({
    source: shiftSourceSchema,
    n: z.coerce.number().int().optional(),
  })
  .refine((v) => v.source === "RANDOM" || v.n !== undefined, {
    message: "Укажите число партнёров.",
    path: ["n"],
  });
export type ChooseShiftInput = z.infer<typeof chooseShiftSchema>;

// --- Судейство и определение проходящих (Этапы 7-8) ---

export const assignJudgeSchema = z.object({
  judgeEmail: z.string().email(),
  role: registrationRoleSchema,
});
export type AssignJudgeInput = z.infer<typeof assignJudgeSchema>;

export const submitJudgeScoreSchema = z.object({
  value: z.coerce.number().int().min(0),
});
export type SubmitJudgeScoreInput = z.infer<typeof submitJudgeScoreSchema>;

export const recordTieBreakDecisionSchema = z.object({
  advancingRegistrationIds: z.array(z.string().min(1)).min(1),
});
export type RecordTieBreakDecisionInput = z.infer<typeof recordTieBreakDecisionSchema>;
