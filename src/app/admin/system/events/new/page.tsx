import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/server/rbac/actor";
import { can } from "@/server/rbac/authorize";
import { EventWizard } from "@/components/admin/events/EventWizard";
import { emptyWizardDraft } from "@/components/admin/events/wizard-types";

// Мониторинг → "Ивенты (все)" → создать событие от имени любого организатора.
// См. комментарий в /admin/content/new/page.tsx — тот же паттерн.
export default async function NewSystemEventPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isAdmin(user)) redirect("/admin");

  const [cities, teachers, actor] = await Promise.all([
    prisma.city.findMany({ where: { isActive: true }, orderBy: { nameRu: "asc" } }),
    prisma.teacher.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    getActor(),
  ]);

  const canCreateCompetition = can(actor, "competition:create");
  const initialDraft = emptyWizardDraft(cities[0]?.id ?? "");

  return (
    <EventWizard
      cities={cities}
      ownedSchools={[]}
      teachers={teachers}
      canCreateCompetition={canCreateCompetition}
      isVerifiedEventOrganizer
      initialDraft={initialDraft}
      basePath="/admin/system/events"
    />
  );
}
