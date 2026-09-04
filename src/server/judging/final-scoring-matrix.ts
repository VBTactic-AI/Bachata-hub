import type { RegistrationRole } from "@prisma/client";

// Кто вправе оценивать какой критерий у какого участника финала — общее
// правило для трёх форматов (Этап 9). В NORMAL/RANDOM_COUPLES критерий
// всегда оценивает судья ТОЙ ЖЕ роли, что и участник (как и в обычных
// раундах). В JUDGES_DANCE (промт пользователя, п.22-23) участника на
// паркете физически партнёрит судья ПРОТИВОПОЛОЖНОЙ роли — значит критерии
// "танцующего судьи" (FinalSettings.config.dancingJudgeCriteriaIds)
// оценивает именно он, а не судья той же роли, что участник.

export type JudgesDanceConfig = { dancingJudgeCriteriaIds?: string[] };

export function oppositeRole(role: RegistrationRole): RegistrationRole {
  return role === "LEADER" ? "FOLLOWER" : "LEADER";
}

export function allowedJudgeRole(criterionId: string, participantRole: RegistrationRole, format: string, config: unknown): RegistrationRole {
  if (format !== "JUDGES_DANCE") return participantRole;
  const dancingIds = (config as JudgesDanceConfig | null)?.dancingJudgeCriteriaIds ?? [];
  return dancingIds.includes(criterionId) ? oppositeRole(participantRole) : participantRole;
}
