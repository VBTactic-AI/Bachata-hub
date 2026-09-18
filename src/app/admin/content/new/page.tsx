import { redirect } from "next/navigation";
import { getCurrentUser, canCreateEvents } from "@/lib/auth";
import { getDancerByUserId } from "@/lib/dancer";
import { prisma } from "@/lib/prisma";
import { getEventTemplate, listEventTemplatesForUser } from "@/server/events/event-template-service";
import { EventWizard } from "@/components/admin/events/EventWizard";
import { emptyWizardDraft, type WizardDraft } from "@/components/admin/events/wizard-types";
import { EVENT_TYPE_REGISTRY } from "@/lib/events/event-type-registry";
import { Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

// "Создать новое событие" — отдельная страница (редизайн 2026-09-16, по
// прямому запросу пользователя): раньше это была ветка без `?draft=` на
// /admin/content, которая делила страницу со списком "Мои события" — теперь
// список живёт на /admin/content, а создание/редактирование — на
// /admin/content/new и /admin/content/edit/[id] соответственно.
//
// Recurring Events v2 — "?templateId=" (кнопка "Создать событие" на карточке
// шаблона, /admin/content/templates) предзаполняет форму настройками
// шаблона. Время предзаполняется (шаблон хранит только "HH:mm" без даты,
// см. EventTemplate.defaultStartTime/defaultEndTime) — дата подставляется
// сегодняшняя как временное значение, организатор всё равно выбирает
// настоящую дату сам на шаге "Дата и время" (2026-09-18: раньше время
// вообще не переносилось — найдено вживую пользователем).
//
// Выбор шаблона прямо здесь (2026-09-18, по прямому запросу пользователя)
// — раньше единственный путь начать "по шаблону" был через отдельную
// страницу /admin/content/templates; организатор, попавший сюда напрямую
// (кнопка "Создать событие" на /admin/content), шаблоны вообще не видел.
// Простая GET-форма — выбор перезагружает страницу с ?templateId=, вся
// логика предзаполнения уже была реализована ниже.
export default async function NewEventPage({ searchParams }: { searchParams: Promise<{ templateId?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canCreateEvents(user)) redirect("/admin");

  const { templateId } = await searchParams;

  const [cities, ownedSchoolsRaw, teachers, dancer, template, availableTemplates] = await Promise.all([
    prisma.city.findMany({ where: { isActive: true }, orderBy: { nameRu: "asc" } }),
    user.role === "SCHOOL_REP"
      ? prisma.school.findMany({ where: { ownerUserId: user.id }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
    prisma.teacher.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    getDancerByUserId(user.id),
    templateId ? getEventTemplate(templateId, user).catch(() => null) : Promise.resolve(null),
    // "Создать по шаблону" прямо на старте визарда (2026-09-18, по прямому
    // запросу пользователя) — раньше этот выбор был доступен ТОЛЬКО с
    // отдельной страницы /admin/content/templates ("Создать событие" на
    // карточке шаблона); организатор, попавший сюда напрямую кнопкой
    // "Создать событие" на /admin/content, шаблоны вообще не видел. Список
    // не нужен, когда шаблон уже выбран (?templateId=) — черновик и так уже
    // предзаполнен им.
    templateId ? Promise.resolve([]) : listEventTemplatesForUser(user),
  ]);

  const ownedSchools = ownedSchoolsRaw.map((s) => ({ id: s.id, name: s.name, verificationStatus: s.verificationStatus }));

  // "Организатор" подтягивается автоматически: своя школа, если она есть
  // (первая, если их несколько), иначе — отображаемое имя танцора из профиля
  // (см. StepBasic.tsx — поле больше не редактируется в самом мастере).
  const base = emptyWizardDraft(template?.cityId || cities[0]?.id || "");
  // Сегодняшняя дата (локальная) + время шаблона (2026-09-18, по прямому
  // запросу пользователя — "время не переносится") — шаблон хранит только
  // "HH:mm" без даты (EventTemplate.defaultStartTime/defaultEndTime), сама
  // дата организатору всё равно нужно выбрать заново на шаге "Дата и время"
  // (см. комментарий выше про templateId), но время хотя бы не приходится
  // вводить вручную ещё раз.
  const today = new Date();
  const todayLocalDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const initialDraft: WizardDraft = template
    ? {
        ...base,
        format: template.format,
        level: template.level,
        title: template.name,
        description: template.description || "",
        schoolId: template.schoolId || ownedSchools[0]?.id || "",
        organizerName: !template.schoolId && ownedSchools.length === 0 ? (dancer?.displayName ?? "") : "",
        venueName: template.venueName || "",
        venueAddress: template.venueAddress || "",
        startsAt: template.defaultStartTime ? `${todayLocalDate}T${template.defaultStartTime}` : "",
        endsAt: template.defaultEndTime ? `${todayLocalDate}T${template.defaultEndTime}` : "",
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
        // Детали мастер-класса (2026-09-18, по прямому запросу пользователя
        // — "настройки MASTERCLASS нужно добавить") — тот же приём, что и у
        // party выше; sessions НЕ переносятся из шаблона (у EventTemplate их
        // физически нет, это конкретное расписание с реальными датами/
        // временем, а не то, что имеет смысл хранить как заготовку).
        masterclass:
          template.format === "MASTERCLASS" && template.typeDetails
            ? {
                ...base.masterclass,
                style: (template.typeDetails as { style?: string })?.style ?? "",
                format: (template.typeDetails as { format?: string })?.format ?? "",
                partnerRequired: (template.typeDetails as { partnerRequired?: boolean })?.partnerRequired ?? false,
              }
            : base.masterclass,
      }
    : {
        ...base,
        schoolId: ownedSchools[0]?.id ?? "",
        organizerName: ownedSchools.length === 0 ? (dancer?.displayName ?? "") : "",
      };

  return (
    <div className="flex flex-col gap-4">
      {availableTemplates.length > 0 && (
        <form method="get" className="flex flex-wrap items-end gap-2 rounded-app border border-admin-border bg-admin-card/50 p-3">
          <label className="flex flex-col gap-1 text-xs text-admin-muted">
            Создать по шаблону
            <Select
              name="templateId"
              defaultValue=""
              className="min-w-[220px] border-admin-border bg-admin-card2 py-1.5 text-sm text-night-text focus:border-admin-primary focus:ring-admin-primary/20"
            >
              <option value="">— с нуля —</option>
              {availableTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {EVENT_TYPE_REGISTRY[t.format].icon} {t.name}
                </option>
              ))}
            </Select>
          </label>
          <Button type="submit" size="sm" variant="adminOutline">
            Применить
          </Button>
        </form>
      )}

      <EventWizard
        cities={cities}
        ownedSchools={ownedSchools}
        teachers={teachers}
        isVerifiedEventOrganizer={user.role === "ADMIN" || user.isVerifiedEventOrganizer}
        initialDraft={initialDraft}
        basePath="/admin/content"
      />
    </div>
  );
}
