import type { Event, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { uniqueSlug } from "@/lib/slug";
import { canCreateEvents } from "@/lib/auth";
import { formatEventDate } from "@/lib/format";
import { shouldAutoApproveEvent } from "@/lib/events/moderation";
import { logModeration } from "@/lib/moderation";
import { computePublishChecklist, isChecklistComplete, type ChecklistItem } from "@/lib/events/event-type-registry";
import { createCompetition } from "@/server/competition/create-competition";
import { emitDomainEvent } from "@/server/notifications/emit-domain-event";
import type { EventDraftInput } from "./schemas";

// Event Engine — доменный сервис создания/обновления черновика события
// (CLAUDE.md §48/§53: бизнес-логика не в React/route handler'ах). Один
// сервис для Save Draft И Publish — разница только в том, какой checklist
// обязателен (см. ниже), не в двух параллельных путях кода.

export class EventForbiddenError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
export class EventValidationError extends Error {
  constructor(public issues: ChecklistItem[]) {
    super("event_incomplete");
  }
}
export class EventNotFoundError extends Error {}

// Понятные сообщения (CLAUDE.md §46) для кодов EventForbiddenError, у которых
// причина не самоочевидна из самого кода — используется обоими роутами
// (/api/events, /api/event-drafts/[id]), не дублируется в каждом.
export const EVENT_FORBIDDEN_MESSAGES: Record<string, string> = {
  event_archived: "Событие в архиве — редактирование недоступно.",
  forbidden: "У вашего аккаунта нет прав на создание или редактирование событий.",
  forbidden_school: "Вы не можете создавать события от имени этой школы.",
  forbidden_competition_create: "У вашего аккаунта нет прав на создание соревнований.",
  forbidden_duplicate_contest: "Конкурсы (Jack & Jill) нельзя дублировать этим способом — создайте новое соревнование на странице /admin/competitions/new.",
  forbidden_contest_via_wizard: "Конкурсы (Jack & Jill) создаются только на странице /admin/competitions/new — этот мастер для них больше не используется.",
};

const BASELINE_IDS = new Set(["title", "city", "venue", "startsAt"]);

// Вынесено из upsertEventDraft (2026-09-16, Recurring Events) — та же самая
// проверка "auto-approve vs требует нового review после REJECTED" (QA BUG-002)
// нужна и в src/server/events/series-publish.ts (автопубликация occurrence
// серии) — переиспользуем один расчёт вместо повторной копии критичной для
// безопасности логики модерации.
export function decidePublishModeration(
  currentModerationStatus: "PENDING" | "APPROVED" | "REJECTED",
  autoApprove: boolean
): {
  moderationFields: { moderationStatus: "APPROVED"; moderatedAt: Date; moderatedById: null } | { moderationStatus: "PENDING" };
  notifyPublished: boolean;
} {
  const requiresReReview = currentModerationStatus === "REJECTED";
  const willAutoApprove = autoApprove && !requiresReReview;
  return {
    moderationFields: willAutoApprove
      ? { moderationStatus: "APPROVED" as const, moderatedAt: new Date(), moderatedById: null }
      : { moderationStatus: "PENDING" as const },
    notifyPublished: willAutoApprove,
  };
}

// Даже сохранение ЧЕРНОВИКА требует минимум данных — этого требует сама
// таблица Event (title/cityId/venueName/startsAt NOT NULL, существовали до
// этой задачи, менять ради частично-пустых черновиков означало бы
// переписывать все места, которые уже читают event.city/event.startsAt как
// гарантированно существующие — EventCard, /events/[slug], поиск и т.д.).
// Поэтому до заполнения Basic/Location/Date-time шагов черновик существует
// только как локальное состояние мастера в браузере (см. PERFORMANCE в
// задаче — "use client state for unfinished form"), а не как строка в БД.
function assertBaseline(items: ChecklistItem[]) {
  const missing = items.filter((i) => BASELINE_IDS.has(i.id) && !i.ok);
  if (missing.length > 0) throw new EventValidationError(missing);
}

export async function upsertEventDraft(input: EventDraftInput, user: User, existingId?: string) {
  if (!canCreateEvents(user)) throw new EventForbiddenError("forbidden");

  const school = input.schoolId ? await prisma.school.findUnique({ where: { id: input.schoolId } }) : null;
  if (input.schoolId && (!school || (user.role === "SCHOOL_REP" && school.ownerUserId !== user.id))) {
    throw new EventForbiddenError("forbidden_school");
  }

  const checklist = computePublishChecklist(input.format, {
    title: input.title,
    cityId: input.cityId,
    venueName: input.venueName,
    startsAt: input.startsAt,
    masterclassSessions: input.masterclass?.sessions,
  });
  assertBaseline(checklist);
  if (input.status === "PUBLISHED" && !isChecklistComplete(checklist)) {
    throw new EventValidationError(checklist.filter((i) => !i.ok));
  }

  const existing = existingId ? await prisma.event.findUnique({ where: { id: existingId } }) : null;
  if (existingId && (!existing || (existing.createdById !== user.id && user.role !== "ADMIN"))) {
    throw new EventForbiddenError("forbidden");
  }
  // Конкурс (JNJ) + его Competition теперь заводятся только вместе, одним
  // действием на /admin/competitions/new (см. комментарий у
  // WIZARD_SELECTABLE_EVENT_FORMATS в event-type-registry.ts) — этот сервис
  // (общий Event Wizard) больше не создаёт события формата CONTEST и не
  // позволяет переключить в него уже существующее событие другого формата.
  // Редактирование ОСТАЛЬНЫХ полей уже существующего CONTEST-события (оно
  // могло быть заведено до этой задачи) по-прежнему разрешено — формат в
  // этом случае просто не меняется.
  if (input.format === "CONTEST" && existing?.format !== "CONTEST") {
    throw new EventForbiddenError("forbidden_contest_via_wizard");
  }
  // QA BUG-001: ARCHIVED — терминальное состояние для этого сервиса (сюда
  // ведёт только cancelEvent()). Без этой проверки ARCHIVED→PUBLISHED
  // проходил бы напрямую через обычное сохранение черновика, минуя вообще
  // любую проверку модерации/видимости (см. отчёт QA). Явной функциональности
  // "вернуть из архива" сегодня нет ни в одном UI — если понадобится, это
  // отдельная, осознанная операция, а не побочный эффект обычного save.
  if (existing && existing.status === "ARCHIVED") {
    throw new EventForbiddenError("event_archived");
  }

  const autoApprove = shouldAutoApproveEvent(user, school);
  const startsAt = new Date(input.startsAt!);
  const endsAt = input.endsAt ? new Date(input.endsAt) : null;

  const { row: event, unpublishAuditNote } = await prisma.$transaction(async (tx) => {
    // QA BUG-001 — заполняется ниже, если событие снимается с публикации;
    // logModeration зовётся ПОСЛЕ commit'а транзакции (тот же порядок, что и
    // в api/moderation/events/[id]/route.ts — тот тоже логирует отдельным
    // вызовом после $transaction, не внутри неё), поэтому наружу отдаём
    // просто данные, а не сам вызов.
    let unpublishAuditNote: { eventId: string; activeRegistrations: number } | null = null;
    const base = {
      title: input.title!,
      cityId: input.cityId!,
      schoolId: input.schoolId || null,
      organizerName: input.schoolId ? null : input.organizerName || null,
      format: input.format,
      // event_type сегодня следует за форматом "конкурс" — та же логика, что
      // была в исходном /api/events до этой задачи.
      eventType: (input.format === "CONTEST" ? "CONTEST" : "REGULAR") as "CONTEST" | "REGULAR",
      level: input.level,
      startsAt,
      endsAt,
      venueName: input.venueName!,
      venueAddress: input.venueAddress || null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      capacity: input.capacity ?? null,
      registrationEnabled: input.registrationEnabled ?? false,
      ticketingMode: input.ticketingMode ?? "UNSET",
      description: input.description || null,
      // photoUrl НЕ пишется здесь намеренно — денормализованный кэш главной
      // афиши, единственный писатель — src/server/events/event-media-service.ts
      // (см. комментарий у поля в schema.prisma).
      priceText: input.priceText || null,
      externalLinkUrl: input.externalLinkUrl || null,
      tags: input.tags ?? [],
      status: input.status,
      certainty: input.certainty,
    };

    // Уведомления Event Engine (Notification & Subscription Engine, Phase 6):
    // "опубликовано" — это именно момент, когда событие становится РЕАЛЬНО
    // видимым (status=PUBLISHED И moderationStatus=APPROVED, см.
    // activeEventFilter() в src/lib/events.ts и гейт на /events/[slug]) — не
    // просто смена status у ещё не прошедшего модерацию события. Если
    // autoApprove=false, PUBLISHED уходит в очередь модерации и уведомление
    // отправится позже, из PATCH /api/moderation/events/[id] (там же, где
    // moderationStatus реально становится APPROVED).
    let row: Event;
    let notifyPublished = false;
    let notifyUpdatedFields: string[] | null = null;

    if (existing) {
      const movingDraftToPublished = existing.status === "DRAFT" && input.status === "PUBLISHED";
      // QA BUG-002: republish после явного REJECTED не должен тихо обходить
      // решение модератора через auto-approve — organizer мог бы: сохранить
      // отклонённое PUBLISHED-событие как DRAFT (см. BUG-001), затем сразу
      // опубликовать снова, и verified-organizer auto-approve пропускал бы
      // его без единого нового review, да ещё с искажённой атрибуцией
      // (moderatedById оставался указывать на админа, который его отклонил).
      // Явный REJECTED всегда требует нового человеческого решения — auto-
      // approve рассчитан на "модератор ещё не видел контент", а не на
      // "модератор его явно отклонил".
      const publishDecision = movingDraftToPublished ? decidePublishModeration(existing.moderationStatus, autoApprove) : null;
      // QA BUG-001: снятие с публикации живого (реально видимого) события —
      // не должно быть тихим. Полноценного AuditLog в Слое 1 нет (см.
      // audit_report.md), поэтому переиспользуем уже существующий
      // ModerationLog тем же способом, что и /api/moderation/events/[id] —
      // вызывается ПОСЛЕ транзакции (см. ниже), здесь только считаем флаг.
      const wasLiveAndVisible = existing.status === "PUBLISHED" && existing.moderationStatus === "APPROVED";
      const isUnpublishing = wasLiveAndVisible && input.status === "DRAFT";

      row = await tx.event.update({
        where: { id: existing.id },
        data: {
          ...base,
          // Отправка на модерацию/авто-approve происходит один раз, в момент
          // первого Publish — повторное сохранение уже опубликованного
          // события не должно тихо перезапускать модерацию заново.
          ...(publishDecision ? publishDecision.moderationFields : {}),
        },
      });

      notifyPublished = publishDecision?.notifyPublished ?? false;

      if (isUnpublishing) {
        const activeRegistrations = await tx.eventRegistration.count({
          where: { eventId: existing.id, status: { in: ["REGISTERED", "CONFIRMED", "WAITLIST"] } },
        });
        unpublishAuditNote = { eventId: existing.id, activeRegistrations };
      }

      // "Изменение" — только для события, которое УЖЕ было полностью живым
      // (не в момент его первой публикации выше) и только по полям, реально
      // значимым для подписчика (время/место), не по любому сохранению формы.
      if (wasLiveAndVisible && !movingDraftToPublished) {
        const changed: string[] = [];
        if (existing.startsAt.getTime() !== startsAt.getTime()) changed.push("startsAt");
        if (existing.venueName !== base.venueName) changed.push("venueName");
        if ((existing.venueAddress ?? null) !== base.venueAddress) changed.push("venueAddress");
        if (changed.length > 0) notifyUpdatedFields = changed;
      }
    } else {
      const slug = await uniqueSlug("event", input.title!);
      row = await tx.event.create({
        data: {
          ...base,
          slug,
          createdById: user.id,
          ...(input.status === "PUBLISHED"
            ? autoApprove
              ? { moderationStatus: "APPROVED" as const, moderatedAt: new Date() }
              : { moderationStatus: "PENDING" as const }
            : {}),
        },
      });

      notifyPublished = input.status === "PUBLISHED" && autoApprove;

      // Наследование тикетов/Pass шаблоном (2026-09-16, по прямому запросу
      // пользователя) — копируется РОВНО ОДИН РАЗ, в момент создания нового
      // события из шаблона (тот же принцип, что и typeDetails при
      // prefill'е WizardDraft в new/page.tsx). templateId не проверяется
      // zod'ом на принадлежность — доверяем только тому, что реально
      // принадлежит текущему пользователю (или ADMIN), иначе тихо
      // игнорируем: это bonus-préfill, а не обязательное поле, форсированная
      // ошибка здесь только сломала бы обычное сохранение события.
      if (input.templateId) {
        const template = await tx.eventTemplate.findUnique({
          where: { id: input.templateId },
          include: { ticketTypes: true, passes: true },
        });
        if (template && (template.createdById === user.id || user.role === "ADMIN")) {
          // По одному через create(), не createMany() (2026-09-18, исправление
          // бага, найденного пользователем при проверке "переносятся ли поля
          // шаблона") — Commerce Engine v1 требует у каждого Pass/TicketType
          // свой Product (см. createPass()/createTicketType() в pass-service.ts/
          // ticket-type-service.ts, тот же приём): createMany() физически не
          // может вернуть id вставленных строк, чтобы тут же завести Product на
          // каждую, и билет по такому "безpродуктовому" Pass/TicketType вообще
          // нельзя было бы выдать — issueTicket()/issueTicketForType() упали бы
          // с "Product не найден — рассинхронизация Commerce Engine".
          for (const t of template.ticketTypes) {
            const created = await tx.ticketType.create({
              data: {
                eventId: row.id,
                name: t.name,
                description: t.description,
                price: t.price,
                currency: t.currency,
                quantity: t.quantity,
              },
            });
            await tx.product.create({ data: { eventId: row.id, type: "EVENT_TICKET", ticketTypeId: created.id } });
          }
          for (const p of template.passes) {
            const created = await tx.pass.create({
              data: {
                eventId: row.id,
                name: p.name,
                description: p.description,
                type: p.type,
                price: p.price,
                currency: p.currency,
                quantity: p.quantity,
                imageUrl: p.imageUrl,
                allowMultipleEntry: p.allowMultipleEntry,
              },
            });
            await tx.product.create({ data: { eventId: row.id, type: "PASS", passId: created.id } });
          }
        }
      }
    }

    if (notifyPublished) {
      await emitDomainEvent(tx, {
        type: "EVENT_PUBLISHED",
        payload: {
          entityId: row.id,
          eventSlug: row.slug,
          title: row.title,
          date: formatEventDate(row.startsAt),
          cityId: row.cityId,
          format: row.format,
          schoolId: row.schoolId,
          createdById: row.createdById,
        },
        idempotencyKey: `EVENT_PUBLISHED:${row.id}`,
      });
    } else if (notifyUpdatedFields) {
      await emitDomainEvent(tx, {
        type: "EVENT_UPDATED",
        payload: {
          entityId: row.id,
          eventSlug: row.slug,
          title: row.title,
          cityId: row.cityId,
          format: row.format,
          schoolId: row.schoolId,
          createdById: row.createdById,
          changedFields: notifyUpdatedFields,
        },
        // updatedAt в ключе — КАЖДОЕ значимое изменение это отдельное
        // событие (не то же самое, что EVENT_PUBLISHED, где повтор с тем же
        // ключом — намеренный no-op).
        idempotencyKey: `EVENT_UPDATED:${row.id}:${row.updatedAt.toISOString()}`,
      });
    }

    // Type-specific данные — полная замена на каждое сохранение (черновик
    // сохраняется целиком по явному действию, не по полю, см. PERFORMANCE в
    // задаче), не диффинг построчно: объём (тэги/сессии/цены) всегда мал.
    await tx.eventPriceOption.deleteMany({ where: { eventId: row.id } });
    if (input.priceOptions?.length) {
      await tx.eventPriceOption.createMany({
        data: input.priceOptions.map((p, order) => ({
          eventId: row.id,
          label: p.label,
          price: p.price ?? null,
          currency: p.currency || null,
          order,
        })),
      });
    }

    if (input.format === "PARTY") {
      await tx.masterclassDetails.deleteMany({ where: { eventId: row.id } });
      await tx.partyDetails.upsert({
        where: { eventId: row.id },
        create: { eventId: row.id, ...(input.party ?? {}) },
        update: { ...(input.party ?? {}) },
      });
    } else if (input.format === "MASTERCLASS") {
      await tx.partyDetails.deleteMany({ where: { eventId: row.id } });
      const details = await tx.masterclassDetails.upsert({
        where: { eventId: row.id },
        create: {
          eventId: row.id,
          style: input.masterclass?.style || null,
          format: input.masterclass?.format || null,
          partnerRequired: input.masterclass?.partnerRequired ?? false,
        },
        update: {
          style: input.masterclass?.style || null,
          format: input.masterclass?.format || null,
          partnerRequired: input.masterclass?.partnerRequired ?? false,
        },
      });
      await tx.masterclassSession.deleteMany({ where: { masterclassDetailsId: details.id } });
      if (input.masterclass?.sessions?.length) {
        await tx.masterclassSession.createMany({
          data: input.masterclass.sessions.map((s, order) => ({
            masterclassDetailsId: details.id,
            title: s.title,
            teacherId: s.teacherId || null,
            startTime: new Date(s.startTime),
            endTime: new Date(s.endTime),
            room: s.room || null,
            level: s.level ?? null,
            capacity: s.capacity ?? null,
            order,
          })),
        });
      }
    } else {
      // FESTIVAL — больше не создаётся через этот мастер (Festival Engine:
      // Festival — отдельная сущность, создаётся своим флоу, не Event Wizard'ом,
      // см. docs/FESTIVAL_ENGINE_ER.md). format=FESTIVAL остаётся валидным
      // значением enum только как метка на bridge-Event уже существующего
      // Festival — сюда код не заходит осознанно, ветки для него нет.
      await tx.partyDetails.deleteMany({ where: { eventId: row.id } });
      await tx.masterclassDetails.deleteMany({ where: { eventId: row.id } });
    }

    return { row, unpublishAuditNote };
  });

  if (unpublishAuditNote) {
    await logModeration(
      user,
      "EVENT",
      unpublishAuditNote.eventId,
      "unpublish",
      unpublishAuditNote.activeRegistrations > 0
        ? `Снято с публикации организатором, активных регистраций на момент снятия: ${unpublishAuditNote.activeRegistrations}`
        : "Снято с публикации организатором"
    );
  }

  // Competition создаётся ВНЕ транзакции Event (createCompetition — уже
  // существующий, отдельно протестированный сервис со своей транзакцией и
  // аудитом, не форкаем его ради вложенного tx). Если это упадёт, Event уже
  // сохранён как валидный черновик/анонс — повторное сохранение с тем же
  // форматом CONTEST просто попробует создать связь снова (event.competition
  // проверяется заново).
  let competitionId: string | null = null;
  if (input.format === "CONTEST") {
    const withCompetition = await prisma.event.findUnique({ where: { id: event.id }, include: { competition: true } });
    if (!withCompetition?.competition) {
      const created = await createCompetition({
        name: input.title!,
        cityId: input.cityId,
        venue: input.venueName,
        timezone: "Europe/Minsk",
        startAt: startsAt,
        endAt: endsAt ?? undefined,
        eventId: event.id,
      });
      competitionId = created.id;
    } else {
      competitionId = withCompetition.competition.id;
    }
  }

  return { event, competitionId };
}

// Минимальная отмена события (Notification & Subscription Engine, Phase 6 —
// EVENT_CANCELLED не имел ни одного writer'а до этой задачи, см. аудит).
// Права — те же, что и у редактирования черновика (getEventDraftForEdit
// ниже): автор события или ADMIN, школа-владелец сама по себе прав не даёт
// (как и раньше в этом файле). НЕ трогает связанный JNJ Competition (если
// format=CONTEST) — жизненный цикл соревнования отдельный, движок слоя 3 не
// переписываем ради этой задачи.
export async function cancelEvent(eventId: string, user: User) {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw new EventNotFoundError();
  if (event.createdById !== user.id && user.role !== "ADMIN") throw new EventForbiddenError("forbidden");
  if (event.status === "ARCHIVED") return event; // идемпотентно — повторная отмена не ошибка

  // QA BUG-003: видимость события — status=PUBLISHED И moderationStatus=
  // APPROVED (тот же инвариант, что и activeEventFilter() в src/lib/events.ts
  // и гейт /events/[slug]) — раньше проверялся только status, поэтому отмена
  // ещё не одобренного модератором (PENDING) события слала EVENT_CANCELLED,
  // хотя его никто и не видел.
  const wasPublished = event.status === "PUBLISHED" && event.moderationStatus === "APPROVED";

  return prisma.$transaction(async (tx) => {
    const row = await tx.event.update({ where: { id: eventId }, data: { status: "ARCHIVED" } });

    // Уведомляем, только если событие реально было видимым — отмена ещё не
    // прошедшего модерацию черновика никому не была видна, сообщать не о чем.
    if (wasPublished) {
      await emitDomainEvent(tx, {
        type: "EVENT_CANCELLED",
        payload: {
          entityId: row.id,
          eventSlug: row.slug,
          title: row.title,
          cityId: row.cityId,
          format: row.format,
          schoolId: row.schoolId,
          createdById: row.createdById,
        },
        idempotencyKey: `EVENT_CANCELLED:${row.id}`,
      });
    }

    return row;
  });
}

// "Дублировать" из таблички "Мои события" (2026-09-18, по прямому запросу
// пользователя) — быстрый старт для организатора, который регулярно
// проводит похожие мероприятия. Копия всегда уходит в DRAFT (никогда не
// публикуется сама) — организатор обязательно проходит через мастер ещё
// раз перед тем, как копия станет видна кому-либо (дата и название почти
// всегда нужно поправить). Сознательно НЕ копируются: медиа/афиша, билеты/
// Pass/промокоды (это проданные/настроенные инстансы — слепое копирование
// создало бы путаницу с ценами у уже не того события), регистрации
// участников, серия/шаблон (дубликат — обычное разовое событие, даже если
// исходное было частью серии).
export async function duplicateEvent(eventId: string, user: User) {
  const source = await getEventDraftForEdit(eventId, user);
  // Конкурс (JNJ) теперь заводится только через createCompetition()
  // (/admin/competitions/new, см. комментарий там) — дублирование сюда
  // создало бы Event с format=CONTEST без связанного Competition, тупиковый
  // и в мастере (там формат больше не выбираем), и на публичной странице.
  if (source.format === "CONTEST") {
    throw new EventForbiddenError("forbidden_duplicate_contest");
  }

  const slug = await uniqueSlug("event", `${source.title} (копия)`);

  return prisma.$transaction(async (tx) => {
    const row = await tx.event.create({
      data: {
        title: `${source.title} (копия)`,
        cityId: source.cityId,
        schoolId: source.schoolId,
        organizerName: source.organizerName,
        format: source.format,
        eventType: "REGULAR",
        level: source.level,
        startsAt: source.startsAt,
        endsAt: source.endsAt,
        venueName: source.venueName,
        venueAddress: source.venueAddress,
        capacity: source.capacity,
        description: source.description,
        priceText: source.priceText,
        externalLinkUrl: source.externalLinkUrl,
        ticketingMode: source.ticketingMode,
        tags: source.tags,
        certainty: source.certainty,
        slug,
        status: "DRAFT",
        createdById: user.id,
      },
    });

    if (source.partyDetails) {
      const pd = source.partyDetails;
      await tx.partyDetails.create({
        data: {
          eventId: row.id,
          musicStyles: pd.musicStyles,
          djs: pd.djs,
          danceFloors: pd.danceFloors,
          artists: pd.artists,
          dressCode: pd.dressCode,
          photographer: pd.photographer,
          foodAndDrinks: pd.foodAndDrinks,
          parking: pd.parking,
          cloakroom: pd.cloakroom,
        },
      });
    }
    if (source.masterclassDetails) {
      const md = source.masterclassDetails;
      await tx.masterclassDetails.create({
        data: { eventId: row.id, style: md.style, format: md.format, partnerRequired: md.partnerRequired },
      });
    }
    if (source.priceOptions.length > 0) {
      await tx.eventPriceOption.createMany({
        data: source.priceOptions.map((o) => ({
          eventId: row.id,
          label: o.label,
          price: o.price,
          currency: o.currency,
          order: o.order,
        })),
      });
    }

    return row;
  });
}

export async function getEventDraftForEdit(eventId: string, user: User) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      city: true,
      school: true,
      partyDetails: true,
      masterclassDetails: { include: { sessions: { orderBy: { order: "asc" } } } },
      priceOptions: { orderBy: { order: "asc" } },
      media: { orderBy: { sortOrder: "asc" } },
      competition: true,
    },
  });
  if (!event) throw new EventNotFoundError();
  if (event.createdById !== user.id && user.role !== "ADMIN") throw new EventForbiddenError("forbidden");
  return event;
}

// "Опубликовать" из таблички "Мои события" (2026-09-16, по прямому запросу
// пользователя) — быстрое действие ИЗ СПИСКА, БЕЗ захода в мастер. Явно
// НЕ флипает status напрямую (CLAUDE.md §45 "плохо: PATCH со status в
// теле") — собирает те же данные, что мастер отправил бы на шаге
// "Публикация", и прогоняет их через upsertEventDraft(), так что
// EventValidationError (недостающий чеклист), модерация и уведомления — та
// же единая логика, что и при обычной публикации из мастера, не отдельная
// урезанная копия.
export async function publishEvent(eventId: string, user: User) {
  const event = await getEventDraftForEdit(eventId, user);
  if (event.status === "PUBLISHED") return event; // идемпотентно

  const input: EventDraftInput = {
    status: "PUBLISHED",
    format: event.format,
    certainty: event.certainty,
    title: event.title,
    description: event.description ?? undefined,
    level: event.level,
    cityId: event.cityId,
    schoolId: event.schoolId ?? undefined,
    organizerName: event.organizerName ?? undefined,
    venueName: event.venueName,
    venueAddress: event.venueAddress ?? undefined,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt ? event.endsAt.toISOString() : undefined,
    capacity: event.capacity ?? undefined,
    registrationEnabled: event.registrationEnabled,
    ticketingMode: event.ticketingMode,
    priceText: event.priceText ?? undefined,
    externalLinkUrl: event.externalLinkUrl || undefined,
    tags: event.tags,
    priceOptions: event.priceOptions.map((p) => ({
      label: p.label,
      price: p.price != null ? Number(p.price) : undefined,
      currency: p.currency ?? undefined,
    })),
    party:
      event.format === "PARTY" && event.partyDetails
        ? {
            musicStyles: event.partyDetails.musicStyles,
            djs: event.partyDetails.djs,
            danceFloors: event.partyDetails.danceFloors,
            artists: event.partyDetails.artists,
            dressCode: event.partyDetails.dressCode ?? undefined,
            photographer: event.partyDetails.photographer ?? undefined,
            foodAndDrinks: event.partyDetails.foodAndDrinks ?? undefined,
            parking: event.partyDetails.parking ?? undefined,
            cloakroom: event.partyDetails.cloakroom ?? undefined,
          }
        : undefined,
    masterclass:
      event.format === "MASTERCLASS" && event.masterclassDetails
        ? {
            style: event.masterclassDetails.style ?? undefined,
            format: event.masterclassDetails.format ?? undefined,
            partnerRequired: event.masterclassDetails.partnerRequired,
            sessions: event.masterclassDetails.sessions.map((s) => ({
              title: s.title,
              teacherId: s.teacherId ?? undefined,
              startTime: s.startTime.toISOString(),
              endTime: s.endTime.toISOString(),
              room: s.room ?? undefined,
              level: s.level ?? undefined,
              capacity: s.capacity ?? undefined,
            })),
          }
        : undefined,
  };

  const result = await upsertEventDraft(input, user, eventId);
  return result.event;
}
