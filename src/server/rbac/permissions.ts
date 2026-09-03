// Единственный источник кодов прав движка соревнований — ни один код не
// должен встречаться в коде литералом мимо этого файла (CLAUDE.md §30, §49).
// Должно оставаться 1:1 с prisma/seed-layer3.ts (PERMISSIONS).
export const PERMISSIONS = [
  "competition:create",
  "competition:update",
  "competition:delete",
  "competition:publish",
  "competition:settings_update",
  "competition:members_manage",

  "registration:view",
  "registration:create",
  "registration:update_own",
  "registration:manage",
  "registration:role_override_review",

  "checkin:manage",
  "checkin:self",

  "draw:generate",
  "draw:reroll",
  "draw:lock",
  "draw:override",

  "round:create",
  "round:start",
  "round:pause",
  "round:end",
  "timer:control",
  "rotation:control",

  "score:submit",
  "score:correct",
  "score:view_own",
  "score:view_all",
  "judge:ranking_submit",
  "judge:conflict_declare",

  "result:calculate",
  "result:review",
  "result:publish",
  "result:unpublish",

  "penalty:create",
  "disqualification:create",

  "audit:view",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}
