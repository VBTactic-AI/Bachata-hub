import { cache } from "react";
import { getSessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Permission } from "./permissions";

export type Actor = {
  userId: string;
  email: string;
  // Права, действующие на весь движок (роль GLOBAL, сегодня — только
  // SUPER_ADMIN, плюс мост из layer-1 UserRole.ADMIN — см. docs/00_DECISIONS.md, D2).
  globalPermissions: Set<Permission>;
  // Права по конкретным соревнованиям — набирается из CompetitionMember.
  permissionsByCompetition: Map<string, Set<Permission>>;
};

// null для гостя — вызывающий код сам решает, кидать AuthenticationRequiredError
// или обрабатывать анонимный доступ (напр. публичные результаты).
//
// React cache() — тот же приём, что и у getCurrentUser() (см. её комментарий):
// на странице судьи, например, сама страница вызывает getActor() для
// редиректа, а requirePermission() внутри getJudgeQueue() зовёт его снова —
// без cache() это дублирующийся набор запросов к RBAC-таблицам за один и тот
// же HTTP-запрос.
//
// Раньше здесь был `await getCurrentUser()` первым шагом — но getActor()'у
// из результата getCurrentUser() нужен только userId, а он известен сразу
// после проверки подписи JWT (без похода в БД). Ожидание полной строки User
// только ради userId искусственно делало RBAC-запрос ниже последовательным
// ПОСЛЕ отдельного round-trip'а getCurrentUser() (~150мс + ~150мс = ~300мс
// на удалённой БД, Supabase pooler) — хотя оба запроса не зависят друг от
// друга по данным. getSessionUserId() — тот же декодинг без запроса к БД,
// поэтому RBAC-запрос теперь стартует сразу, не дожидаясь getCurrentUser()
// (который, если вызван где-то ещё в этом же HTTP-запросе — напр. в layout —
// теперь ничем не блокируется и может выполняться параллельно).
export const getActor = cache(async (): Promise<Actor | null> => {
  const userId = await getSessionUserId();
  if (!userId) return null;

  // role/isBlocked/email добавлены в ТОТ ЖЕ select, что и раньше отдельно
  // запрашивал getCurrentUser() — экономит ещё один round-trip: Role сама
  // становится известна из ЭТОГО же запроса, не нужно ждать её из
  // getCurrentUser(), чтобы решить, нужен ли SUPER_ADMIN-мост ниже.
  const userWithRbac = await prisma.user.findUnique({
    where: { id: userId },
    relationLoadStrategy: "join",
    select: {
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
    ? await prisma.role.findUnique({
        where: { code: "SUPER_ADMIN" },
        relationLoadStrategy: "join",
        include: { permissions: { include: { permission: true } } },
      })
    : null;

  const globalPermissions = new Set<Permission>();
  for (const assignment of userWithRbac.competitionRoleAssignments) {
    for (const rp of assignment.role.permissions) {
      globalPermissions.add(rp.permission.code as Permission);
    }
  }
  for (const rp of superAdminRole?.permissions ?? []) {
    globalPermissions.add(rp.permission.code as Permission);
  }

  const permissionsByCompetition = new Map<string, Set<Permission>>();
  for (const member of userWithRbac.competitionMemberships) {
    let set = permissionsByCompetition.get(member.competitionId);
    if (!set) {
      set = new Set<Permission>();
      permissionsByCompetition.set(member.competitionId, set);
    }
    for (const rp of member.role.permissions) {
      set.add(rp.permission.code as Permission);
    }
  }

  return { userId, email: userWithRbac.email, globalPermissions, permissionsByCompetition };
});
