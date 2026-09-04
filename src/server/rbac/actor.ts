import { cache } from "react";
import { getCurrentUser } from "@/lib/auth";
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
export const getActor = cache(async (): Promise<Actor | null> => {
  const user = await getCurrentUser();
  if (!user) return null;

  // Мост со слоем 1 (docs/00_DECISIONS.md, D2) запрошен той же волной
  // запросов, а не отдельным await после неё — на удалённой БД (Supabase
  // pooler) каждый дополнительный последовательный round-trip стоит
  // ~150мс, а этот путь идёт демо-ADMIN'ом буквально на каждое действие.
  const isSiteAdmin = user.role === "ADMIN";
  // relationLoadStrategy: "join" — role -> permissions -> permission — без
  // него каждая из трёх веток сама по себе стоила бы больше одного
  // round-trip'а (Promise.all ограничивает общее время самой медленной
  // веткой, а не суммой, но каждая лишняя вложенность всё равно добавляет
  // задержку внутри своей ветки).
  const [globalAssignments, memberships, superAdminRole] = await Promise.all([
    prisma.userRoleAssignment.findMany({
      where: { userId: user.id },
      relationLoadStrategy: "join",
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    }),
    prisma.competitionMember.findMany({
      where: { userId: user.id },
      relationLoadStrategy: "join",
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    }),
    isSiteAdmin
      ? prisma.role.findUnique({
          where: { code: "SUPER_ADMIN" },
          relationLoadStrategy: "join",
          include: { permissions: { include: { permission: true } } },
        })
      : Promise.resolve(null),
  ]);

  const globalPermissions = new Set<Permission>();
  for (const assignment of globalAssignments) {
    for (const rp of assignment.role.permissions) {
      globalPermissions.add(rp.permission.code as Permission);
    }
  }
  for (const rp of superAdminRole?.permissions ?? []) {
    globalPermissions.add(rp.permission.code as Permission);
  }

  const permissionsByCompetition = new Map<string, Set<Permission>>();
  for (const member of memberships) {
    let set = permissionsByCompetition.get(member.competitionId);
    if (!set) {
      set = new Set<Permission>();
      permissionsByCompetition.set(member.competitionId, set);
    }
    for (const rp of member.role.permissions) {
      set.add(rp.permission.code as Permission);
    }
  }

  return { userId: user.id, email: user.email, globalPermissions, permissionsByCompetition };
});
