import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AdminSectionShell } from "@/components/admin/AdminSectionShell";
import { SchoolAdminSidebar } from "@/components/admin/sidebars/SchoolAdminSidebar";

// Школа — доступ только владельцу (School.ownerUserId), выданному через
// одобрение AccessRequest(SCHOOL_HEAD) (см. docs/00_DECISIONS.md, 2026-09-14).
// Делегирование доступа другим администраторам школы — следующий этап.
export default async function SchoolAdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const school = await prisma.school.findFirst({ where: { ownerUserId: user.id } });
  if (!school) redirect("/admin");

  return <AdminSectionShell sidebar={<SchoolAdminSidebar />}>{children}</AdminSectionShell>;
}
