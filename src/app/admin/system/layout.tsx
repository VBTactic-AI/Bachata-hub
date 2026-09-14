import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { AdminSectionShell } from "@/components/admin/AdminSectionShell";
import { SystemAdminSidebar } from "@/components/admin/sidebars/SystemAdminSidebar";

// Мониторинг — только SUPER_ADMIN (site ADMIN). Гейт на уровне layout, а не
// только на каждой странице по отдельности (страницы внутри сохраняют свою
// собственную проверку как defense-in-depth, но не полагаются только на неё).
export default async function SystemAdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) redirect("/admin");

  return <AdminSectionShell sidebar={<SystemAdminSidebar />}>{children}</AdminSectionShell>;
}
