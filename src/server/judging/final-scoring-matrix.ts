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

// Сколько пар (участник × критерий) обязан оценить судья указанной РОЛИ —
// общий подсчёт для confirmFinalJudgeRoundDone (final-scoring.ts) и
// getFinalScoringProgressInTx (final-advancement.ts), чтобы не разойтись в
// двух местах (2026-09-07, добавлено вместе с кнопкой "Готово" для финала —
// по образцу обычных раундов, A21).
export function countRequiredForJudgeRole(
  participants: { role: RegistrationRole }[],
  criteria: { id: string }[],
  format: string,
  config: unknown,
  judgeRole: RegistrationRole
): number {
  let required = 0;
  for (const p of participants) {
    for (const c of criteria) {
      if (allowedJudgeRole(c.id, p.role, format, config) === judgeRole) required++;
    }
  }
  return required;
}
