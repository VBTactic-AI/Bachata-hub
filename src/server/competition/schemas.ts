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

export const divisionLevelSchema = z.enum([
  "NOVICE",
  "INTERMEDIATE",
  "ADVANCED",
  "OPEN",
  "INVITATIONAL",
  "CUSTOM",
]);

export const addDivisionSchema = z.object({
  name: z.string().min(1).max(100),
  level: divisionLevelSchema,
  minAge: z.coerce.number().int().positive().optional(),
  maxAge: z.coerce.number().int().positive().optional(),
  maxParticipants: z.coerce.number().int().positive().optional(),
  rules: z.record(z.unknown()).default({}),
});
export type AddDivisionInput = z.infer<typeof addDivisionSchema>;

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
