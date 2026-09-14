import { redirect } from "next/navigation";
import { isAdmin, getCurrentUser } from "@/lib/auth";
import { getActor } from "@/server/rbac/actor";
import { can } from "@/server/rbac/authorize";
import { AdminSectionShell } from "@/components/admin/AdminSectionShell";
import { CompetitionAdminSidebar } from "@/components/admin/sidebars/CompetitionAdminSidebar";

// Соревнования — организатор соревнований (глобальное право competition:create,
// выданное через AccessRequest, см. docs/00_DECISIONS.md) ИЛИ участник хотя бы
// одного соревнования в любой роли (CompetitionMember — HEAD_JUDGE/JUDGE/
// SCORER/DJ/MC тоже заходят сюда посмотреть своё, страница
// /admin/competitions уже показывает им только относящееся к ним + открытые
// для регистрации). Справочники внутри сайдбара — отдельно только для
// isAdmin (супер-админ).
export default async function CompetitionsAdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const actor = await getActor();
  const hasAccess = isAdmin(user) || can(actor, "competition:create") || (actor?.permissionsByCompetition.size ?? 0) > 0;
  if (!hasAccess) redirect("/admin");

  return <AdminSectionShell sidebar={<CompetitionAdminSidebar isAdminUser={isAdmin(user)} />}>{children}</AdminSectionShell>;
}
