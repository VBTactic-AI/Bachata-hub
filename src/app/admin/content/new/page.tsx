import { redirect } from "next/navigation";
import { getCurrentUser, canCreateEvents } from "@/lib/auth";
import { getDancerByUserId } from "@/lib/dancer";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/server/rbac/actor";
import { can } from "@/server/rbac/authorize";
import { EventWizard } from "@/components/admin/events/EventWizard";
import { emptyWizardDraft } from "@/components/admin/events/wizard-types";

// "Создать новое событие" — отдельная страница (редизайн 2026-09-16, по
// прямому запросу пользователя): раньше это была ветка без `?draft=` на
// /admin/content, которая делила страницу со списком "Мои события" — теперь
// список живёт на /admin/content, а создание/редактирование — на
// /admin/content/new и /admin/content/edit/[id] соответственно.
export default async function NewEventPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canCreateEvents(user)) redirect("/admin");

  const [cities, ownedSchoolsRaw, teachers, actor, dancer] = await Promise.all([
    prisma.city.findMany({ where: { isActive: true }, orderBy: { nameRu: "asc" } }),
    user.role === "SCHOOL_REP"
      ? prisma.school.findMany({ where: { ownerUserId: user.id }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
    prisma.teacher.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    getActor(),
    getDancerByUserId(user.id),
  ]);

  const ownedSchools = ownedSchoolsRaw.map((s) => ({ id: s.id, name: s.name, verificationStatus: s.verificationStatus }));
  const canCreateCompetition = can(actor, "competition:create");

  // "Организатор" подтягивается автоматически: своя школа, если она есть
  // (первая, если их несколько), иначе — отображаемое имя танцора из профиля
  // (см. StepBasic.tsx — поле больше не редактируется в самом мастере).
  const initialDraft = {
    ...emptyWizardDraft(cities[0]?.id ?? ""),
    schoolId: ownedSchools[0]?.id ?? "",
    organizerName: ownedSchools.length === 0 ? (dancer?.displayName ?? "") : "",
  };

  return (
    <EventWizard
      cities={cities}
      ownedSchools={ownedSchools}
      teachers={teachers}
      canCreateCompetition={canCreateCompetition}
      isVerifiedEventOrganizer={user.role === "ADMIN" || user.isVerifiedEventOrganizer}
      initialDraft={initialDraft}
      basePath="/admin/content"
    />
  );
}
