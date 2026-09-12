import { getActor, type Actor } from "./actor";
import type { Permission } from "./permissions";
import { AuthenticationRequiredError, MfaRequiredError, NotCompetitionMemberError, PermissionDeniedError } from "../errors";

// Права, которые выдаёт роль JUDGE и ТОЛЬКО она (prisma/seed-layer3.ts) —
// судья не должен видеть "Панель управления" /admin вообще (CLAUDE.md
// §40/§52: судейский UI не перегружается админскими функциями), даже в
// урезанном виде, где почти все секции и так уже скрыты индивидуальными
// can()-проверками (жалоба пользователя, 2026-09-10: сама возможность
// попасть на /admin с ролью судьи — уже лишнее). Используется как
// редирект-гейт на страницах, у которых нет дублирующей публичной роли
// (в отличие от /admin/competitions[/[id]], куда намеренно тоже заходят
// танцоры — см. комментарий в тех страницах).
const JUDGE_ONLY_PERMISSIONS: ReadonlySet<Permission> = new Set<Permission>([
  "score:submit",
  "score:view_own",
  "judge:ranking_submit",
  "judge:conflict_declare",
]);

// true, если ВСЕ права актёра (глобальные + по всем соревнованиям, вместе)
// укладываются в набор роли JUDGE — если он ещё где-то EVENT_ADMIN/
// HEAD_JUDGE/SCORER/DJ и т.п. хотя бы в одном соревновании, не трогаем.
// Актёр вовсе без прав (гость, ещё не назначенный никуда) — не "только
// судья", это отдельный случай, здесь не решаем.
export function isJudgeOnlyActor(actor: Actor): boolean {
  if (actor.globalPermissions.size > 0) return false;
  let hasAny = false;
  for (const set of actor.permissionsByCompetition.values()) {
    for (const p of set) {
      hasAny = true;
      if (!JUDGE_ONLY_PERMISSIONS.has(p)) return false;
    }
  }
  return hasAny;
}

// Реализует шаги "Authentication -> RBAC -> competition membership" конвейера
// авторизации (03 §3). Шаги "resource ownership/assignment", "state
// validation" и "business rule validation" — ответственность вызывающего
// сервиса (для этого этапа фундамента ещё нет самих операций, которые их
// требуют; конкретные draw/scoring/... сервисы подключат их на своих этапах).
//
// competitionId omitted => проверяется только глобальное право (напр.
// competition:create — создавать может SUPER_ADMIN, до появления самого
// соревнования членства в нём просто не может существовать).
export function can(actor: Actor | null, permission: Permission, competitionId?: string): boolean {
  if (!actor) return false;
  if (actor.globalPermissions.has(permission)) return true;
  if (!competitionId) return false;
  return actor.permissionsByCompetition.get(competitionId)?.has(permission) ?? false;
}

// Бросает доменную ошибку вместо возврата boolean — используется в
// route handlers/server actions, где отказ должен прервать выполнение.
export async function requirePermission(
  permission: Permission,
  competitionId?: string
): Promise<Actor> {
  const actor = await getActor();
  if (!actor) throw new AuthenticationRequiredError();
  // Проверяется ДО конкретного права: роль, требующая MFA (SUPER_ADMIN/
  // EVENT_ADMIN/сайтовый ADMIN-мост — src/server/mfa/policy.ts), не должна
  // получить доступ ни к одной привилегированной операции, пока сессия не
  // поднята до aal2 — независимо от того, какое именно право сейчас
  // запрошено (задача §6: AAL1 никогда не считается достаточным для
  // операции, требующей AAL2). Оба поля необязательные в типе Actor — для
  // существующих тестовых фикстур без них это условие всегда false, ничего
  // не ломает (см. комментарий у Actor).
  if (actor.mfaRequired && !actor.mfaSatisfied) {
    throw new MfaRequiredError();
  }
  if (can(actor, permission, competitionId)) return actor;

  // Различаем "прав вообще нет" и "прав нет именно в этом соревновании" —
  // второе обычно значит, что пользователя забыли добавить в CompetitionMember,
  // а не что ему запрещено в принципе (полезно для сообщения об ошибке).
  if (competitionId && !actor.permissionsByCompetition.has(competitionId) && actor.globalPermissions.size === 0) {
    throw new NotCompetitionMemberError();
  }
  throw new PermissionDeniedError(permission);
}
