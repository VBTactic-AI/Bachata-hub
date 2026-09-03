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
  rules: z.record(z.unknown()).default({}),
});
export type AddDivisionInput = z.infer<typeof addDivisionSchema>;

export const createDivisionCategorySchema = z.object({
  name: z.string().min(1).max(100),
});
export type CreateDivisionCategoryInput = z.infer<typeof createDivisionCategorySchema>;

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

// TIE_BREAK/DANCE_OFF намеренно исключены — эти раунды создаёт Advancement
// Engine автоматически при ничьей на cutoff (CLAUDE.md §19-21, этап 8), а не
// организатор вручную через эту форму.
export const manualRoundTypeSchema = z.enum(["PRELIMINARY", "CALLBACK", "QUARTERFINAL", "SEMIFINAL", "FINAL"]);

export const createRoundSchema = z.object({
  name: z.string().min(1).max(200),
  type: manualRoundTypeSchema,
  finalistsCount: z.coerce.number().int().positive().optional(),
});
export type CreateRoundInput = z.infer<typeof createRoundSchema>;

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
