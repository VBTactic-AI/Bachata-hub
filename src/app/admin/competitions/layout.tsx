import { redirect } from "next/navigation";
import { isAdmin, getCurrentUser } from "@/lib/auth";
import { getActor } from "@/server/rbac/actor";
import { hasNoAdminAccess } from "@/server/rbac/authorize";
import { AdminSectionShell } from "@/components/admin/AdminSectionShell";
import { CompetitionAdminSidebar } from "@/components/admin/sidebars/CompetitionAdminSidebar";

// Соревнования — ТОЛЬКО реальный персонал: организатор (глобальное
// competition:create, выданное через AccessRequest) ИЛИ штатное назначение
// хотя бы в одном соревновании (EVENT_ADMIN/HEAD_JUDGE/SCORER/DJ/MC —
// hasNoAdminAccess уже отделяет их от рядовых прав участника/судьи). Рядовой
// зарегистрированный танцор сюда не попадает, даже если у него открыта
// регистрация где-то — это его собственная витрина/регистрация — /compete
// (см. её комментарий: "/admin/competitions — рабочий инструмент
// организатора/судьи, /compete — витрина для танцора"), не рабочий
// инструмент организатора (уточнено пользователем, 2026-09-14 — раньше
// здесь ошибочно пускало и рядового COMPETITOR).  Справочники внутри
// сайдбара — отдельно только для isAdmin (супер-админ).
export default async function CompetitionsAdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const actor = await getActor();
  const hasAccess = isAdmin(user) || (actor !== null && !hasNoAdminAccess(actor));
  if (!hasAccess) redirect("/admin");

  return <AdminSectionShell sidebar={<CompetitionAdminSidebar isAdminUser={isAdmin(user)} />}>{children}</AdminSectionShell>;
}
