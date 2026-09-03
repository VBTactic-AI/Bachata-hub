import { getActor, type Actor } from "./actor";
import type { Permission } from "./permissions";
import { AuthenticationRequiredError, NotCompetitionMemberError, PermissionDeniedError } from "../errors";

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
  if (can(actor, permission, competitionId)) return actor;

  // Различаем "прав вообще нет" и "прав нет именно в этом соревновании" —
  // второе обычно значит, что пользователя забыли добавить в CompetitionMember,
  // а не что ему запрещено в принципе (полезно для сообщения об ошибке).
  if (competitionId && !actor.permissionsByCompetition.has(competitionId) && actor.globalPermissions.size === 0) {
    throw new NotCompetitionMemberError();
  }
  throw new PermissionDeniedError(permission);
}
