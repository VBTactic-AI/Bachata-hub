import { redirect } from "next/navigation";
import { getCurrentUser, canCreateEvents } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEventDraftForEdit, EventNotFoundError, EventForbiddenError } from "@/server/events/event-service";
import { EventWizard } from "@/components/admin/events/EventWizard";
import { dateToLocalInputValue, emptyWizardRecurrenceState, type WizardDraft } from "@/components/admin/events/wizard-types";

// "Редактировать" — отдельная страница (см. комментарий в .../new/page.tsx).
// Намеренно НЕ /admin/content/[id]/edit — тот путь уже занят
// `[id]/layout.tsx` (единая оболочка карточки события с вкладками
// Обзор/Участники/Команда/..., см. EventDashboardLayout), под мастер она не
// должна заезжать; поэтому "edit" — отдельный сегмент ДО [id], а не после.
export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canCreateEvents(user)) redirect("/admin");

  const { id } = await params;

  let event: Awaited<ReturnType<typeof getEventDraftForEdit>> | null = null;
  try {
    event = await getEventDraftForEdit(id, user);
  } catch (err) {
    if (err instanceof EventNotFoundError || err instanceof EventForbiddenError) redirect("/admin/content");
    throw err;
  }

  const [cities, ownedSchoolsRaw, teachers] = await Promise.all([
    prisma.city.findMany({ where: { isActive: true }, orderBy: { nameRu: "asc" } }),
    user.role === "SCHOOL_REP"
      ? prisma.school.findMany({ where: { ownerUserId: user.id }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
    prisma.teacher.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);

  const ownedSchools = ownedSchoolsRaw.map((s) => ({ id: s.id, name: s.name, verificationStatus: s.verificationStatus }));

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
    competitionId: event.competition?.id ?? null,
    makeTemplate: false,
    templateName: "",
    makeRecurring: false,
    recurrence: emptyWizardRecurrenceState(),
    seriesId: event.seriesId,
    sourceTemplateId: null,
  };

  return (
    <EventWizard
      cities={cities}
      ownedSchools={ownedSchools}
      teachers={teachers}
      isVerifiedEventOrganizer={user.role === "ADMIN" || user.isVerifiedEventOrganizer}
      initialDraft={initialDraft}
      basePath="/admin/content"
    />
  );
}
