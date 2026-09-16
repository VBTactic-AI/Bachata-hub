import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/server/rbac/actor";
import { can } from "@/server/rbac/authorize";
import { getEventDraftForEdit } from "@/server/events/event-service";
import { EventWizard } from "@/components/admin/events/EventWizard";
import { dateToLocalInputValue, type WizardDraft } from "@/components/admin/events/wizard-types";

// Мониторинг → "Ивенты (все)" → редактировать ЛЮБОЕ событие. См. комментарий
// в /admin/content/edit/[id]/page.tsx — тот же паттерн (getEventDraftForEdit
// и так пропускает ADMIN мимо проверки createdById).
export default async function EditSystemEventPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isAdmin(user)) redirect("/admin");

  const { id } = await params;
  const event = await getEventDraftForEdit(id, user);

  const [cities, teachers, actor] = await Promise.all([
    prisma.city.findMany({ where: { isActive: true }, orderBy: { nameRu: "asc" } }),
    prisma.teacher.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    getActor(),
  ]);

  const canCreateCompetition = can(actor, "competition:create");

  const initialDraft: WizardDraft = {
    id: event.id,
    slug: event.slug,
    status: event.status,
    format: event.format,
    certainty: event.certainty,
    title: event.title,
    description: event.description ?? "",
    media: event.media.map((m) => ({
      id: m.id,
      url: m.url,
      isMain: m.isMain,
      sortOrder: m.sortOrder,
      width: m.width,
      height: m.height,
      objectPosition: m.objectPosition,
    })),
    level: event.level,
    cityId: event.cityId,
    schoolId: event.schoolId ?? "",
    organizerName: event.organizerName ?? "",
    venueName: event.venueName,
    venueAddress: event.venueAddress ?? "",
    startsAt: dateToLocalInputValue(event.startsAt),
    endsAt: event.endsAt ? dateToLocalInputValue(event.endsAt) : "",
    capacity: event.capacity != null ? String(event.capacity) : "",
    registrationEnabled: event.registrationEnabled,
    ticketingMode: event.ticketingMode,
    priceText: event.priceText ?? "",
    externalLinkUrl: event.externalLinkUrl ?? "",
    tags: event.tags.join(", "),
    priceOptions: event.priceOptions.map((p) => ({
      label: p.label,
      price: p.price != null ? String(p.price) : "",
      currency: p.currency ?? "",
    })),
    party: {
      musicStyles: event.partyDetails?.musicStyles.join(", ") ?? "",
      djs: event.partyDetails?.djs.join(", ") ?? "",
      danceFloors: event.partyDetails?.danceFloors.join(", ") ?? "",
      artists: event.partyDetails?.artists.join(", ") ?? "",
      dressCode: event.partyDetails?.dressCode ?? "",
      photographer: event.partyDetails?.photographer ?? "",
      foodAndDrinks: event.partyDetails?.foodAndDrinks ?? "",
      parking: event.partyDetails?.parking ?? false,
      cloakroom: event.partyDetails?.cloakroom ?? false,
    },
    masterclass: {
      style: event.masterclassDetails?.style ?? "",
      format: event.masterclassDetails?.format ?? "",
      partnerRequired: event.masterclassDetails?.partnerRequired ?? false,
      sessions:
        event.masterclassDetails?.sessions.map((s) => ({
          title: s.title,
          teacherId: s.teacherId ?? "",
          startTime: dateToLocalInputValue(s.startTime),
          endTime: dateToLocalInputValue(s.endTime),
          room: s.room ?? "",
          level: s.level ?? "",
          capacity: s.capacity != null ? String(s.capacity) : "",
        })) ?? [],
    },
    festival: {
      programItems:
        event.festivalDetails?.programItems.map((p) => ({
          title: p.title,
          type: p.type,
          startTime: dateToLocalInputValue(p.startTime),
          endTime: p.endTime ? dateToLocalInputValue(p.endTime) : "",
          teacherId: p.teacherId ?? "",
        })) ?? [],
    },
    competitionId: event.competition?.id ?? null,
  };

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
