import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AdminSectionShell } from "@/components/admin/AdminSectionShell";
import { FestivalAdminSidebar } from "@/components/admin/sidebars/FestivalAdminSidebar";

// Фестивали — доступ через одобрение AccessRequest(FESTIVAL_ORGANIZER), сама
// система ведения фестивалей ещё не спроектирована (docs/00_DECISIONS.md,
// 2026-09-14) — только заглушка "доступ одобрен".
export default async function FestivalAdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isVerifiedFestivalOrganizer) redirect("/admin");

  return <AdminSectionShell sidebar={<FestivalAdminSidebar />}>{children}</AdminSectionShell>;
}
