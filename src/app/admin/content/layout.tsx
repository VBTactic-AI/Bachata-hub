import { redirect } from "next/navigation";
import { getCurrentUser, canCreateEvents } from "@/lib/auth";
import { AdminSectionShell } from "@/components/admin/AdminSectionShell";
import { EventAdminSidebar } from "@/components/admin/sidebars/EventAdminSidebar";

// Ивенты — canCreateEvents() (легаси-роли SCHOOL_REP/ORGANIZER/MODERATOR/
// ADMIN ИЛИ isVerifiedEventOrganizer, выданный через AccessRequest, см.
// docs/00_DECISIONS.md, 2026-09-14).
export default async function ContentAdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canCreateEvents(user)) redirect("/admin");

  return <AdminSectionShell sidebar={<EventAdminSidebar />}>{children}</AdminSectionShell>;
}
