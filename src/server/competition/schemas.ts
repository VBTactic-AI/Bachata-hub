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

// Все поля необязательны по отдельности (можно поменять только порядок,
// только название, или только видимость) — но хотя бы одно обязано
// присутствовать. До этого порядок вообще нельзя было поменять после
// создания (2026-09-04).
export const updateDivisionCategorySchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    order: z.coerce.number().int().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => v.name !== undefined || v.order !== undefined || v.isActive !== undefined, {
    message: "Нужно указать хотя бы одно поле для изменения.",
  });
export type UpdateDivisionCategoryInput = z.infer<typeof updateDivisionCategorySchema>;

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

// PAUSED намеренно отсутствует — пауза раунда как отдельная кнопка убрана
// (по запросу пользователя, 2026-09-04): она путалась с паузой захода и
// вызвала реальный баг (раунд застревал, docs/00_DECISIONS.md A17), а
// единственный её эффект (не дать стартовать следующий заход) и так
// достигается тем, что "Запустить" просто не нажимают. Пауза остаётся у
// захода и у ротации партнёров — это разные, самостоятельные вещи.
export const roundStatusSchema = z.enum(["DRAFT", "READY", "DRAWING", "DRAW_LOCKED", "RUNNING", "FINISHED", "SCORING", "COMPLETED"]);

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

// Судейская сетка дивизиона одним "Сохранить" (две таблички — кто судит
// ведущих/ведомых, галочки из общего пула судей соревнования) — по запросу
// пользователя, 2026-09-04, заменяет добавление судей по одному.
export const setDivisionJudgesSchema = z.object({
  leaderJudgeUserIds: z.array(z.string().min(1)),
  followerJudgeUserIds: z.array(z.string().min(1)),
});
export type SetDivisionJudgesInput = z.infer<typeof setDivisionJudgesSchema>;

export const submitJudgeScoreSchema = z.object({
  value: z.coerce.number().int().min(0),
  // Ключ идемпотентности офлайн-очереди клиента (CLAUDE.md §17) — судья
  // должен успеть отправить оценку, даже если связи не было.
  clientSubmissionId: z.string().min(1),
});
export type SubmitJudgeScoreInput = z.infer<typeof submitJudgeScoreSchema>;

export const recordTieBreakDecisionSchema = z.object({
  advancingRegistrationIds: z.array(z.string().min(1)).min(1),
});
export type RecordTieBreakDecisionInput = z.infer<typeof recordTieBreakDecisionSchema>;

// --- Финал (Этап 9, docs/00_DECISIONS.md A22) ---

export const finalFormatSchema = z.enum(["NORMAL", "JUDGES_DANCE", "RANDOM_COUPLES"]);

export const setFinalSettingsSchema = z.object({
  format: finalFormatSchema,
  tracksCount: z.coerce.number().int().positive().default(1),
  partnerChangeEnabled: z.boolean().default(false),
  config: z.record(z.unknown()).default({}),
});
export type SetFinalSettingsInput = z.infer<typeof setFinalSettingsSchema>;

// id — есть у уже существующего критерия (обновить), нет — создать новый.
// priority — НЕ коэффициент (CLAUDE.md-стиль промта пользователя, 2026-09-04):
// только порядок сравнения критериев при полной ничье общей суммы.
export const finalCriterionInputSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().min(1).max(100),
    priority: z.coerce.number().int().positive(),
    minScore: z.coerce.number().int(),
    maxScore: z.coerce.number().int(),
    step: z.coerce.number().int().positive().default(1),
  })
  .refine((v) => v.maxScore > v.minScore, { message: "Максимум должен быть больше минимума.", path: ["maxScore"] });
export type FinalCriterionInput = z.infer<typeof finalCriterionInputSchema>;

// Полный список критериев дивизиона одним "Сохранить" (как setDivisionJudges) —
// приоритеты обязаны быть уникальны и идти подряд 1..N (проверяется в
// сервисе, промт пользователя п.50 "priority уникальны"/"идут последовательно").
export const setFinalCriteriaSchema = z.object({
  criteria: z.array(finalCriterionInputSchema).min(1),
});
export type SetFinalCriteriaInput = z.infer<typeof setFinalCriteriaSchema>;

export const submitFinalJudgeScoreSchema = z.object({
  criterionId: z.string().min(1),
  value: z.coerce.number().int(),
  clientSubmissionId: z.string().min(1),
});
export type SubmitFinalJudgeScoreInput = z.infer<typeof submitFinalJudgeScoreSchema>;

// RANK_ALL (CLAUDE.md §22) — коллегиальное решение перетанцовки финала:
// судьи расставили ВСЮ tie-группу по местам, не выбрали N прошедших
// (в финале у всех уже есть место, нужно только разрешить порядок внутри
// группы) — отличается от recordTieBreakDecisionSchema обычных раундов.
export const recordFinalTieBreakDecisionSchema = z.object({
  orderedRegistrationIds: z.array(z.string().min(1)).min(2),
});
export type RecordFinalTieBreakDecisionInput = z.infer<typeof recordFinalTieBreakDecisionSchema>;

// --- Результаты и публикация (Этап 10, docs/00_DECISIONS.md) ---

export const unpublishReasonSchema = z.object({
  reason: z.string().min(1).max(500),
});
export type UnpublishReasonInput = z.infer<typeof unpublishReasonSchema>;

export const resultStatusSchema = z.enum(["FINALIST", "ELIMINATED"]);

export const correctResultSchema = z
  .object({
    status: resultStatusSchema,
    placement: z.coerce.number().int().positive().nullable(),
    reason: z.string().min(1).max(500),
  })
  .refine((v) => v.status === "FINALIST" || v.placement === null, {
    message: "У выбывшего участника не может быть места.",
    path: ["placement"],
  });
export type CorrectResultInput = z.infer<typeof correctResultSchema>;
