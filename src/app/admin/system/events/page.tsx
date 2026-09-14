import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/server/rbac/actor";
import { can } from "@/server/rbac/authorize";
import { getEventDraftForEdit } from "@/server/events/event-service";
import { EventWizard } from "@/components/admin/events/EventWizard";
import { emptyWizardDraft, dateToLocalInputValue, type WizardDraft } from "@/components/admin/events/wizard-types";

// Мониторинг → "Ивенты (все)" — супер-админ видит и может редактировать ЛЮБОЕ
// событие (не только свои), в отличие от /admin/content (только свои).
// Технически это уже поддержано existing-сервисами без изменений:
// getEventDraftForEdit()/upsertEventDraft() и так пропускают ADMIN мимо
// проверки createdById (см. src/server/events/event-service.ts) — здесь
// только убран фильтр `where: { createdById }` при построении списка.
// Намеренное дублирование с admin/content/page.tsx (не общий компонент) —
// разные списки (все/свои), разный заголовок; выносить в общую функцию
// ради экономии ~15 строк не стал (CLAUDE.md §54).
export default async function SystemEventsPage({ searchParams }: { searchParams: Promise<{ draft?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isAdmin(user)) redirect("/admin");

  const { draft: draftId } = await searchParams;

  const [cities, teachers, actor, allEvents] = await Promise.all([
    prisma.city.findMany({ where: { isActive: true }, orderBy: { nameRu: "asc" } }),
    prisma.teacher.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    getActor(),
    prisma.event.findMany({
      where: { status: { not: "ARCHIVED" } },
      orderBy: { updatedAt: "desc" },
      select: { id: true, slug: true, title: true, format: true, status: true, moderationStatus: true },
    }),
  ]);

  const canCreateCompetition = can(actor, "competition:create");

  let initialDraft: WizardDraft = emptyWizardDraft(cities[0]?.id ?? "");
  if (draftId) {
    const event = await getEventDraftForEdit(draftId, user);
    initialDraft = {
      id: event.id,
      slug: event.slug,
      status: event.status,
      format: event.format,
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
      latitude: event.latitude != null ? String(event.latitude) : "",
      longitude: event.longitude != null ? String(event.longitude) : "",
      startsAt: dateToLocalInputValue(event.startsAt),
      endsAt: event.endsAt ? dateToLocalInputValue(event.endsAt) : "",
      capacity: event.capacity != null ? String(event.capacity) : "",
      registrationEnabled: event.registrationEnabled,
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
    };
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="m-0 font-night text-xl font-extrabold text-night-text sm:text-2xl">Все события</h1>
        <p className="m-0 mt-1 text-sm text-admin-muted">Мониторинг — видны и редактируемы ВСЕ события всех организаторов.</p>
      </div>
      <EventWizard
        cities={cities}
        ownedSchools={[]}
        teachers={teachers}
        canCreateCompetition={canCreateCompetition}
        initialDraft={initialDraft}
        myEvents={allEvents.filter((d) => d.id !== draftId)}
        eventListLabel="Все события"
      />
    </div>
  );
}
