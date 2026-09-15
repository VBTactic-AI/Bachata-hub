import { redirect } from "next/navigation";
import { getCurrentUser, canCreateEvents } from "@/lib/auth";
import { getDancerByUserId } from "@/lib/dancer";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/server/rbac/actor";
import { can } from "@/server/rbac/authorize";
import { getEventDraftForEdit, EventNotFoundError, EventForbiddenError } from "@/server/events/event-service";
import { EventWizard } from "@/components/admin/events/EventWizard";
import { emptyWizardDraft, dateToLocalInputValue, type WizardDraft } from "@/components/admin/events/wizard-types";

// Перенесено из /events/new (2026-09-11); с этой задачи ("Event Engine") —
// вместо одностраничной AddEventForm единый EventWizard (Type -> Basic ->
// Location -> Date&Time -> type-specific -> Tickets -> Preview -> Publish).
// Права те же, что и были — canCreateEvents.
export default async function AdminContentPage({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canCreateEvents(user)) redirect("/admin");

  const { draft: draftId } = await searchParams;

  const [cities, ownedSchoolsRaw, teachers, actor, drafts, dancer] = await Promise.all([
    prisma.city.findMany({ where: { isActive: true }, orderBy: { nameRu: "asc" } }),
    user.role === "SCHOOL_REP"
      ? prisma.school.findMany({ where: { ownerUserId: user.id }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
    prisma.teacher.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    getActor(),
    prisma.event.findMany({
      // Все свои события (не только черновики) — organizer должен видеть и
      // уже опубликованные/на модерации, чтобы вернуться и отредактировать
      // (по прямому запросу пользователя, 2026-09-13).
      where: { createdById: user.id, status: { not: "ARCHIVED" } },
      orderBy: { updatedAt: "desc" },
      select: { id: true, slug: true, title: true, format: true, status: true, moderationStatus: true },
    }),
    getDancerByUserId(user.id),
  ]);

  const ownedSchools = ownedSchoolsRaw.map((s) => ({ id: s.id, name: s.name, verificationStatus: s.verificationStatus }));
  const canCreateCompetition = can(actor, "competition:create");

  // Редизайн мастера (2026-09-16, по прямому запросу пользователя) —
  // "Организатор" больше не редактируется в самом мастере (см. StepBasic.tsx
  // — поле убрано), а подтягивается автоматически: своя школа, если она
  // есть (первая, если их несколько — выбор конкретной школы из нескольких
  // сознательно не поддержан в этой версии, тот же принцип упрощения, что и
  // просил пользователь), иначе — отображаемое имя танцора из профиля.
  let initialDraft: WizardDraft = {
    ...emptyWizardDraft(cities[0]?.id ?? ""),
    schoolId: ownedSchools[0]?.id ?? "",
    organizerName: ownedSchools.length === 0 ? (dancer?.displayName ?? "") : "",
  };
  if (draftId) {
    // Ссылка на черновик могла устареть (черновик удалён/архивирован после
    // QA-очистки, или скопирована из чужого аккаунта) — раньше
    // EventNotFoundError/EventForbiddenError вылетали из Server Component
    // необработанными и роняли всю страницу в "Application error" (белый
    // экран без единой подсказки, найдено вживую). Невалидный draft
    // безопасно игнорируем — мастер просто открывается с чистого листа,
    // ничего не удаляется и не перезаписывается.
    let event: Awaited<ReturnType<typeof getEventDraftForEdit>> | null = null;
    try {
      event = await getEventDraftForEdit(draftId, user);
    } catch (err) {
      if (!(err instanceof EventNotFoundError) && !(err instanceof EventForbiddenError)) throw err;
    }
    if (event) initialDraft = {
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
      latitude: event.latitude != null ? String(event.latitude) : "",
      longitude: event.longitude != null ? String(event.longitude) : "",
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
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="m-0 font-night text-xl font-extrabold text-night-text sm:text-2xl">Контент</h1>
          <p className="m-0 mt-1 text-sm text-admin-muted">Создание событий — вечеринки, мастер-классы, соревнования.</p>
        </div>
        <a href="/admin/content/pass-templates" className="text-sm text-admin-primaryHover hover:underline">
          Шаблоны Pass →
        </a>
      </div>
      <EventWizard
        cities={cities}
        ownedSchools={ownedSchools}
        teachers={teachers}
        canCreateCompetition={canCreateCompetition}
        // QA BUG-012: индикатор "будет опубликовано без модерации" раньше
        // учитывал только верифицированную школу — организатор, верифицированный
        // лично (isVerifiedEventOrganizer, без школы), видел неверное "на
        // модерации", хотя сервер его и так одобрит автоматически.
        isVerifiedEventOrganizer={user.role === "ADMIN" || user.isVerifiedEventOrganizer}
        initialDraft={initialDraft}
        myEvents={drafts.filter((d) => d.id !== draftId)}
      />
    </div>
  );
}
