import { z } from "zod";

export const registrationRoleSchema = z.enum(["LEADER", "FOLLOWER"]);

export const registerSelfSchema = z.object({
  divisionId: z.string(),
  role: registrationRoleSchema,
});
export type RegisterSelfInput = z.infer<typeof registerSelfSchema>;

export const registerByAdminSchema = z.object({
  divisionId: z.string(),
  role: registrationRoleSchema,
  email: z.string().email(),
  displayName: z.string().min(1).max(80).optional(),
});
export type RegisterByAdminInput = z.infer<typeof registerByAdminSchema>;

export const reviewRoleOverrideSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  reason: z.string().max(500).optional(),
});
export type ReviewRoleOverrideInput = z.infer<typeof reviewRoleOverrideSchema>;
