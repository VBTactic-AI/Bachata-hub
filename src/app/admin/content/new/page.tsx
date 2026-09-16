import { redirect } from "next/navigation";
import { getCurrentUser, canCreateEvents } from "@/lib/auth";
import { getDancerByUserId } from "@/lib/dancer";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/server/rbac/actor";
import { can } from "@/server/rbac/authorize";
import { getEventTemplate } from "@/server/events/event-template-service";
import { EventWizard } from "@/components/admin/events/EventWizard";
import { emptyWizardDraft, type WizardDraft } from "@/components/admin/events/wizard-types";

// "Создать новое событие" — отдельная страница (редизайн 2026-09-16, по
// прямому запросу пользователя): раньше это была ветка без `?draft=` на
// /admin/content, которая делила страницу со списком "Мои события" — теперь
// список живёт на /admin/content, а создание/редактирование — на
// /admin/content/new и /admin/content/edit/[id] соответственно.
//
// Recurring Events v2 — "?templateId=" (кнопка "Создать событие" на карточке
// шаблона, /admin/content/templates) предзаполняет форму настройками
// шаблона. Дата/время НЕ предзаполняются (шаблон хранит только "HH:mm" без
// даты, см. EventTemplate.defaultStartTime) — организатор выбирает
// конкретную дату сам на шаге "Дата и время".
export default async function NewEventPage({ searchParams }: { searchParams: Promise<{ templateId?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canCreateEvents(user)) redirect("/admin");

  const { templateId } = await searchParams;

  const [cities, ownedSchoolsRaw, teachers, actor, dancer, template] = await Promise.all([
    prisma.city.findMany({ where: { isActive: true }, orderBy: { nameRu: "asc" } }),
    user.role === "SCHOOL_REP"
      ? prisma.school.findMany({ where: { ownerUserId: user.id }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
    prisma.teacher.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    getActor(),
    getDancerByUserId(user.id),
    templateId ? getEventTemplate(templateId, user).catch(() => null) : Promise.resolve(null),
  ]);

  const ownedSchools = ownedSchoolsRaw.map((s) => ({ id: s.id, name: s.name, verificationStatus: s.verificationStatus }));
  const canCreateCompetition = can(actor, "competition:create");

  // "Организатор" подтягивается автоматически: своя школа, если она есть
  // (первая, если их несколько), иначе — отображаемое имя танцора из профиля
  // (см. StepBasic.tsx — поле больше не редактируется в самом мастере).
  const base = emptyWizardDraft(template?.cityId || cities[0]?.id || "");
  const initialDraft: WizardDraft = template
    ? {
        ...base,
        format: template.format,
        level: template.level,
        title: template.name,
        schoolId: template.schoolId || ownedSchools[0]?.id || "",
        organizerName: !template.schoolId && ownedSchools.length === 0 ? (dancer?.displayName ?? "") : "",
        venueName: template.venueName || "",
        venueAddress: template.venueAddress || "",
        capacity: template.capacity != null ? String(template.capacity) : "",
        registrationEnabled: template.registrationEnabled,
        ticketingMode: template.ticketingMode,
        priceText: template.priceText || "",
        externalLinkUrl: template.externalLinkUrl || "",
        tags: template.tags.join(", "),
        certainty: template.certainty,
        sourceTemplateId: template.id,
        party:
          template.format === "PARTY" && template.typeDetails
            ? {
                ...base.party,
                ...(template.typeDetails as Record<string, unknown>),
                musicStyles: ((template.typeDetails as { musicStyles?: string[] })?.musicStyles ?? []).join(", "),
                djs: ((template.typeDetails as { djs?: string[] })?.djs ?? []).join(", "),
                danceFloors: ((template.typeDetails as { danceFloors?: string[] })?.danceFloors ?? []).join(", "),
                artists: ((template.typeDetails as { artists?: string[] })?.artists ?? []).join(", "),
              }
            : base.party,
      }
    : {
        ...base,
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
