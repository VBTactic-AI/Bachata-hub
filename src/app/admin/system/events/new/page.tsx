import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { EventWizard } from "@/components/admin/events/EventWizard";
import { emptyWizardDraft } from "@/components/admin/events/wizard-types";

// Мониторинг → "Ивенты (все)" → создать событие от имени любого организатора.
// См. комментарий в /admin/content/new/page.tsx — тот же паттерн.
export default async function NewSystemEventPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isAdmin(user)) redirect("/admin");

  const [cities, teachers] = await Promise.all([
    prisma.city.findMany({ where: { isActive: true }, orderBy: { nameRu: "asc" } }),
    prisma.teacher.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);

  const initialDraft = emptyWizardDraft(cities[0]?.id ?? "");

  return (
    <EventWizard
      cities={cities}
      ownedSchools={[]}
      teachers={teachers}
      isVerifiedEventOrganizer
      initialDraft={initialDraft}
      basePath="/admin/system/events"
    />
  );
}
