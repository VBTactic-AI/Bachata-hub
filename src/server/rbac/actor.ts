import { cache } from "react";
import { getAuthClaims } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { engineRoleCodeRequiresMfa, siteRoleRequiresMfa } from "@/server/mfa/policy";
import type { Permission } from "./permissions";

export type Actor = {
  userId: string;
  email: string;
  // Права, действующие на весь движок (роль GLOBAL, сегодня — только
  // SUPER_ADMIN, плюс мост из layer-1 UserRole.ADMIN — см. docs/00_DECISIONS.md, D2).
  globalPermissions: Set<Permission>;
  // Права по конкретным соревнованиям — набирается из CompetitionMember.
  permissionsByCompetition: Map<string, Set<Permission>>;
  // true, если хотя бы одна из ролей актёра (глобальная, по любому
  // соревнованию, или сайтовый ADMIN-мост) требует MFA — см.
  // src/server/mfa/policy.ts. Не зависит от того, какое конкретно право
  // сейчас проверяется: раз роль требует MFA, ей закрыты ВСЕ привилегированные
  // операции до подтверждения, а не только специфичные для этой роли.
  //
  // Оба MFA-поля НЕОБЯЗАТЕЛЬНЫЕ в типе намеренно: getActor() всегда
  // проставляет их явно, но ~44 существующих тестовых файла строят Actor
  // литералом без них (предшествуют самой MFA) — requirePermission()
  // трактует отсутствие как "не требуется/выполнено" (см. её код), поэтому
  // старые фикстуры остаются рабочими без единой правки (CLAUDE.md §54).
  mfaRequired?: boolean;
  // true, если mfaRequired не выставлен/false, либо текущая сессия Supabase
  // Auth уже на уровне aal2 (см. src/lib/auth.ts, getAuthClaims()).
  // requirePermission() проверяет именно это поле, а не aal напрямую — так
  // проверка не дублируется по вызывающим местам.
  mfaSatisfied?: boolean;
};

// null для гостя — вызывающий код сам решает, кидать AuthenticationRequiredError
// или обрабатывать анонимный доступ (напр. публичные результаты).
//
// React cache() — тот же приём, что и у getCurrentUser() (см. её комментарий):
// на странице судьи, например, сама страница вызывает getActor() для
// редиректа, а requirePermission() внутри getJudgeQueue() зовёт его снова —
// без cache() это дублирующийся набор запросов к RBAC-таблицам за один и тот
// же HTTP-запрос.
export const getActor = cache(async (): Promise<Actor | null> => {
  const claims = await getAuthClaims();
  if (!claims) return null;

  // role/isBlocked/email добавлены в ТОТ ЖЕ select, что и раньше отдельно
  // запрашивал getCurrentUser() — экономит ещё один round-trip: Role сама
  // становится известна из ЭТОГО же запроса, не нужно ждать её из
  // getCurrentUser(), чтобы решить, нужен ли SUPER_ADMIN-мост ниже.
  const userWithRbac = await prisma.user.findFirst({
    where: { supabaseUserId: claims.supabaseUserId },
    relationLoadStrategy: "join",
    select: {
      id: true,
      role: true,
      isBlocked: true,
      email: true,
      competitionRoleAssignments: {
        include: { role: { include: { permissions: { include: { permission: true } } } } },
      },
      competitionMemberships: {
        include: { role: { include: { permissions: { include: { permission: true } } } } },
      },
    },
  });
  if (!userWithRbac || userWithRbac.isBlocked) return null;

  // Мост со слоем 1 (docs/00_DECISIONS.md, D2) — отдельный запрос (Role не
  // связана с User напрямую), но только когда реально нужен: для абсолютного
  // большинства пользователей (не site-admin) это ноль дополнительных
  // запросов, а не "всегда параллельно, но лишний" — role уже известна из
  // запроса выше, ждать её отдельно не нужно.
  const isSiteAdmin = userWithRbac.role === "ADMIN";
  const superAdminRole = isSiteAdmin
    ? await prisma.role.findFirst({
        where: { code: "SUPER_ADMIN" },
        relationLoadStrategy: "join",
        include: { permissions: { include: { permission: true } } },
      })
    : null;

  let mfaRequired = siteRoleRequiresMfa(userWithRbac.role);

  const globalPermissions = new Set<Permission>();
  for (const assignment of userWithRbac.competitionRoleAssignments) {
    if (engineRoleCodeRequiresMfa(assignment.role.code)) mfaRequired = true;
    for (const rp of assignment.role.permissions) {
      globalPermissions.add(rp.permission.code as Permission);
    }
  }
  for (const rp of superAdminRole?.permissions ?? []) {
    globalPermissions.add(rp.permission.code as Permission);
  }

  const permissionsByCompetition = new Map<string, Set<Permission>>();
  for (const member of userWithRbac.competitionMemberships) {
    if (engineRoleCodeRequiresMfa(member.role.code)) mfaRequired = true;
    let set = permissionsByCompetition.get(member.competitionId);
    if (!set) {
      set = new Set<Permission>();
      permissionsByCompetition.set(member.competitionId, set);
    }
    for (const rp of member.role.permissions) {
      set.add(rp.permission.code as Permission);
    }
  }

  const mfaSatisfied = !mfaRequired || claims.aal === "aal2";

  return {
    userId: userWithRbac.id,
    email: userWithRbac.email,
    globalPermissions,
    permissionsByCompetition,
    mfaRequired,
    mfaSatisfied,
  };
});
