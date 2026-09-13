import { getActor, type Actor } from "./actor";
import type { Permission } from "./permissions";
import { AuthenticationRequiredError, NotCompetitionMemberError, PermissionDeniedError } from "../errors";

// Права, которые выдаёт роль JUDGE и ТОЛЬКО она (prisma/seed-layer3.ts).
const JUDGE_PERMISSIONS: ReadonlySet<Permission> = new Set<Permission>([
  "score:submit",
  "score:view_own",
  "judge:ranking_submit",
  "judge:conflict_declare",
]);

// Права, которые получает любой обычный участник самим фактом регистрации
// на конкурс (registerSelf/registerByAdmin -> CompetitionMember роль
// COMPETITOR, prisma/seed-layer3.ts, src/server/competition/
// register-competitor.ts) — сами по себе тоже не дают ни одной причины
// видеть "Панель управления".
const PARTICIPANT_PERMISSIONS: ReadonlySet<Permission> = new Set<Permission>([
  "registration:create",
  "registration:update_own",
  "checkin:self",
]);

const NON_STAFF_PERMISSIONS: ReadonlySet<Permission> = new Set<Permission>([
  ...JUDGE_PERMISSIONS,
  ...PARTICIPANT_PERMISSIONS,
]);

// true, если у актёра ВООБЩЕ нет прав нигде, либо ВСЕ его права (глобальные +
// по всем соревнованиям, вместе) укладываются в "рядовые" — судья и/или
// обычный участник (см. наборы выше). Значит показывать ему "Панель
// управления" или пускать на /admin незачем (CLAUDE.md §40/§52: судейский/
// участнический UI не перегружается админскими функциями). Раньше это
// проверялось только для судей (isJudgeOnlyActor, здесь заменена) — из-за
// этого рядовые зарегистрированные участники и вообще пользователи без
// единого назначения всё равно видели кнопку и попадали на почти пустую
// страницу /admin (жалоба пользователя, 2026-09-13). Если актёр хотя бы
// где-то EVENT_ADMIN/HEAD_JUDGE(с доп. правами)/SCORER/DJ/MC и т.п. — false,
// кнопка/доступ остаются. Используется как редирект-гейт/условие показа
// ссылки на страницах, у которых нет дублирующей публичной роли (в отличие
// от /admin/competitions[/[id]], куда намеренно тоже заходят танцоры — см.
// комментарий в тех страницах).
export function hasNoAdminAccess(actor: Actor): boolean {
  for (const p of actor.globalPermissions) {
    if (!NON_STAFF_PERMISSIONS.has(p)) return false;
  }
  for (const set of actor.permissionsByCompetition.values()) {
    for (const p of set) {
      if (!NON_STAFF_PERMISSIONS.has(p)) return false;
    }
  }
  return true;
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
  if (can(actor, permission, competitionId)) return actor;

  // Различаем "прав вообще нет" и "прав нет именно в этом соревновании" —
  // второе обычно значит, что пользователя забыли добавить в CompetitionMember,
  // а не что ему запрещено в принципе (полезно для сообщения об ошибке).
  if (competitionId && !actor.permissionsByCompetition.has(competitionId) && actor.globalPermissions.size === 0) {
    throw new NotCompetitionMemberError();
  }
  throw new PermissionDeniedError(permission);
}
