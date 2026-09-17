import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { AdminSectionShell } from "@/components/admin/AdminSectionShell";
import { FestivalAdminSidebar } from "@/components/admin/sidebars/FestivalAdminSidebar";

// Фестивали — доступ через одобрение AccessRequest(FESTIVAL_ORGANIZER) +
// ADMIN (2026-09-17, перенос UI консоли фестиваля — найдено при проверке:
// эта проверка не пропускала ADMIN, хотя весь остальной RBAC Festival
// Engine уже это делает — isOwnerOrAdminFestival/hasFestivalAccess/
// createFestivalDraft в festival-service.ts, тот же принцип, что и у
// canCreateEvents() для /admin/content. Несогласованность — этот layout не
// обновили, когда сервисный слой появился).
export default async function FestivalAdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isVerifiedFestivalOrganizer && !isAdmin(user)) redirect("/admin");

  return <AdminSectionShell sidebar={<FestivalAdminSidebar />}>{children}</AdminSectionShell>;
}
