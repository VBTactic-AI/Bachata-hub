import type { UserRole } from "@prisma/client";

// Единственный источник истины "какая роль обязана включить MFA" — заказано
// явно пользователем (не угадано): SUPER_ADMIN и EVENT_ADMIN движка
// соревнований, плюс сайтовый UserRole.ADMIN (мост на SUPER_ADMIN,
// docs/00_DECISIONS.md D2 — тот же принцип, что уже применяется в
// src/server/rbac/actor.ts для прав, применяем и к MFA, чтобы не разойтись).
// Все остальные роли (HEAD_JUDGE/JUDGE/SCORER/DJ/MC/COMPETITOR) — MFA
// по желанию, не обязательна.
const ENGINE_ROLES_REQUIRING_MFA = new Set(["SUPER_ADMIN", "EVENT_ADMIN"]);

export function engineRoleCodeRequiresMfa(code: string): boolean {
  return ENGINE_ROLES_REQUIRING_MFA.has(code);
}

export function siteRoleRequiresMfa(role: UserRole): boolean {
  return role === "ADMIN";
}
