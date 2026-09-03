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
export async function getActor(): Promise<Actor | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const [globalAssignments, memberships] = await Promise.all([
    prisma.userRoleAssignment.findMany({
      where: { userId: user.id },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    }),
    prisma.competitionMember.findMany({
      where: { userId: user.id },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    }),
  ]);

  const globalPermissions = new Set<Permission>();
  for (const assignment of globalAssignments) {
    for (const rp of assignment.role.permissions) {
      globalPermissions.add(rp.permission.code as Permission);
    }
  }

  // Мост со слоем 1 (docs/00_DECISIONS.md, D2): ADMIN сайта получает полный
  // доступ к движку соревнований без отдельного назначения SUPER_ADMIN.
  if (user.role === "ADMIN") {
    const superAdminRole = await prisma.role.findUnique({
      where: { code: "SUPER_ADMIN" },
      include: { permissions: { include: { permission: true } } },
    });
    for (const rp of superAdminRole?.permissions ?? []) {
      globalPermissions.add(rp.permission.code as Permission);
    }
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
}
