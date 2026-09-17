import type { Event, EventStatus, Festival, ModerationStatus, Pass, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isAdmin, isVerifiedFestivalOrganizer } from "@/lib/auth";
import { uniqueSlug } from "@/lib/slug";
import { shouldAutoApproveEvent } from "@/lib/events/moderation";
import { decidePublishModeration } from "./event-service";
import { validateCommon as validatePassInput, deriveRefundFields, type PassInput } from "./pass-service";
import { isOwnerOrAdminFestival, hasFestivalAccess } from "./access";
import { EventsValidationError, RegistrationForbiddenError, RegistrationNotFoundError } from "./registration-service";

// Festival Engine — сервисный слой (2026-09-17, план
// docs/FESTIVAL_SERVICE_LAYER_PLAN.md, Stage 1). До этой правки сервисного
// слоя для Festival не было вообще — только схема БД (см. план, раздел 0).
//
// Festival НЕ имеет собственного enum-статуса публикации — эффективное
// состояние вычисляется из bridge-Event (computeFestivalStatus ниже),
// ровно как решено в docs/FESTIVAL_ENGINE_ER.md.

// FINDING API-002 (2026-09-17) — наследуется от общего EventsValidationError
// (registration-service.ts), чтобы respondToEventsError() ловил все
// *ValidationError домена одним instanceof, не по отдельности.
export class FestivalValidationError extends EventsValidationError {}

export type FestivalComputedStatus = "DRAFT" | "LINKED" | "PUBLISHED";

export function computeFestivalStatus(festival: {
  eventId: string | null;
  event?: { status: EventStatus; moderationStatus: ModerationStatus } | null;
}): FestivalComputedStatus {
  if (!festival.eventId || !festival.event) return "DRAFT";
  if (festival.event.status === "PUBLISHED" && festival.event.moderationStatus === "APPROVED") return "PUBLISHED";
  return "LINKED";
}

export type FestivalDraftInput = {
  name: string;
  description?: string | null;
  cityId: string;
  venueName?: string | null;
  startsAt: Date;
  endsAt?: Date | null;
};

function validateFestivalInput(input: Partial<FestivalDraftInput>): void {
  if (input.name !== undefined && !input.name.trim()) {
    throw new FestivalValidationError("name_required", "Название фестиваля обязательно.");
  }
  if (input.startsAt && input.endsAt && input.startsAt > input.endsAt) {
    throw new FestivalValidationError("invalid_dates", "Дата начала не может быть позже даты окончания.");
  }
}

// Кто может завести фестиваль — тот же гейт, что и у /admin/festival (см.
// FestivalAdminLayout): isVerifiedFestivalOrganizer (выдаётся ТОЛЬКО через
// одобрение AccessRequest(FESTIVAL_ORGANIZER)), + ADMIN — не generic
// canCreateEvents (тот гейт про ОБЫЧНЫЕ события, это отдельная, более узкая
// проверка именно для фестивалей, уже существующая в проекте).
export async function createFestivalDraft(user: User, input: FestivalDraftInput): Promise<Festival> {
  if (!isVerifiedFestivalOrganizer(user) && !isAdmin(user)) throw new RegistrationForbiddenError("forbidden");
  validateFestivalInput(input);
  const slug = await uniqueSlug("festival", input.name);

  return prisma.festival.create({
    data: {
      slug,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      cityId: input.cityId,
      venueName: input.venueName?.trim() || null,
      startsAt: input.startsAt,
      endsAt: input.endsAt ?? null,
      createdById: user.id,
    },
  });
}

// Переиспользуется Stage 2 сервисами (спонсоры/FAQ/расходы/бюджет) — общая
// проверка "фестиваль существует и у пользователя есть доступ", без
// дублирования в каждом файле.
export async function requireFestivalAccess(festivalId: string, user: User): Promise<Festival> {
  const festival = await prisma.festival.findUnique({ where: { id: festivalId } });
  if (!festival) throw new RegistrationNotFoundError();
  if (!(await hasFestivalAccess(festival, user))) throw new RegistrationForbiddenError("forbidden");
  return festival;
}

export async function getFestivalForEdit(festivalId: string, user: User) {
  const festival = await prisma.festival.findUnique({
    where: { id: festivalId },
    include: { event: true, programItems: { orderBy: { order: "asc" } } },
  });
  if (!festival) throw new RegistrationNotFoundError();
  if (!(await hasFestivalAccess(festival, user))) throw new RegistrationForbiddenError("forbidden");
  return festival;
}

// Публичная — без RBAC, но и без прав вызывающего решать, что показывать:
// видимость (PUBLISHED ли эффективный статус) — забота вызывающей страницы,
// не этой функции (та же граница ответственности, что и у остальных
// get*BySlug в проекте).
export async function getFestivalBySlug(slug: string) {
  return prisma.festival.findUnique({
    where: { slug },
    include: {
      city: true,
      event: true,
      programItems: { orderBy: { order: "asc" }, include: { teacher: true, linkedEvent: true } },
    },
  });
}

export async function listFestivalsForUser(user: User): Promise<(Festival & { event: Event | null })[]> {
  return prisma.festival.findMany({
    where: user.role === "ADMIN" ? {} : { createdById: user.id },
    include: { event: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function updateFestivalDraft(festivalId: string, user: User, patch: Partial<FestivalDraftInput>): Promise<Festival> {
  const festival = await prisma.festival.findUnique({ where: { id: festivalId } });
  if (!festival) throw new RegistrationNotFoundError();
  if (!(await hasFestivalAccess(festival, user))) throw new RegistrationForbiddenError("forbidden");
  validateFestivalInput(patch);

  return prisma.festival.update({
    where: { id: festivalId },
    data: {
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.description !== undefined ? { description: patch.description?.trim() || null } : {}),
      ...(patch.cityId !== undefined ? { cityId: patch.cityId } : {}),
      ...(patch.venueName !== undefined ? { venueName: patch.venueName?.trim() || null } : {}),
      ...(patch.startsAt !== undefined ? { startsAt: patch.startsAt } : {}),
      ...(patch.endsAt !== undefined ? { endsAt: patch.endsAt } : {}),
    },
  });
}

// "Архивировать" фестиваль = снять с публикации bridge-Event (сам Festival
// не имеет собственного статуса). Нечего архивировать, если bridge ещё не
// появился — фестиваль и так нигде не виден.
export async function archiveFestival(festivalId: string, user: User): Promise<Festival & { event: Event | null }> {
  const festival = await prisma.festival.findUnique({ where: { id: festivalId } });
  if (!festival) throw new RegistrationNotFoundError();
  if (!isOwnerOrAdminFestival(festival, user)) throw new RegistrationForbiddenError("forbidden");
  if (!festival.eventId) {
    throw new FestivalValidationError("no_bridge_event", "Нечего архивировать — у фестиваля ещё нет ни одного Pass.");
  }
  await prisma.event.update({ where: { id: festival.eventId }, data: { status: "ARCHIVED" } });
  return prisma.festival.findUniqueOrThrow({ where: { id: festivalId }, include: { event: true } });
}

// Физическое удаление — только для черновика, у которого ЕЩЁ НЕТ
// bridge-Event (значит, и Pass, и продаж, и участников тоже нет). Как только
// появился bridge — только архивация (CLAUDE.md §18, история не удаляется).
export async function deleteFestivalDraft(festivalId: string, user: User): Promise<void> {
  const festival = await prisma.festival.findUnique({ where: { id: festivalId } });
  if (!festival) throw new RegistrationNotFoundError();
  if (!isOwnerOrAdminFestival(festival, user)) throw new RegistrationForbiddenError("forbidden");
  if (festival.eventId) {
    throw new FestivalValidationError(
      "has_bridge_event",
      "У фестиваля уже есть событие/Pass — черновик так удалить нельзя, только архивировать."
    );
  }
  await prisma.festival.delete({ where: { id: festivalId } });
}

// Ленивое создание bridge-Event (2026-09-17, прямая спецификация
// пользователя) — единственный способ, которым Festival.eventId вообще
// заполняется. Пользователь НЕ создаёт и не привязывает bridge вручную:
// 1. Проверяем Festival.eventId.
// 2. Если уже есть — используем его.
// 3. Если нет — создаём системный Event (формат FESTIVAL, черновик, без
//    собственной формы редактирования) и сразу пишем его id в
//    Festival.eventId.
// 4. Создаём сам Pass на этом eventId.
// 5. Всё — одна транзакция: не может получиться так, что bridge создан, а
//    Pass — нет (или наоборот).
// Bridge создаётся ТОЛЬКО в этот момент — фестиваль без единого Pass
// никакого Event не получает (не заводим "на всякий случай").
export async function createFestivalPass(festivalId: string, user: User, input: PassInput): Promise<Pass> {
  const festival = await prisma.festival.findUnique({ where: { id: festivalId } });
  if (!festival) throw new RegistrationNotFoundError();
  if (!isOwnerOrAdminFestival(festival, user)) throw new RegistrationForbiddenError("forbidden");
  validatePassInput(input);
  const refundFields = deriveRefundFields(input);

  return prisma.$transaction(async (tx) => {
    let eventId = festival.eventId;

    if (!eventId) {
      const slug = await uniqueSlug("event", festival.name);
      const bridgeEvent = await tx.event.create({
        data: {
          slug,
          title: festival.name,
          cityId: festival.cityId,
          format: "FESTIVAL",
          level: "ALL_LEVELS",
          startsAt: festival.startsAt,
          endsAt: festival.endsAt,
          venueName: festival.venueName || festival.name,
          description: festival.description,
          status: "DRAFT",
          createdById: festival.createdById,
          // Без этого гость не может зарегистрироваться на bridge-Event
          // публично (Event.registrationEnabled по умолчанию false) — а
          // issueTicket() требует существующую EventRegistration ДО выдачи
          // Pass ("сначала регистрация, потом Pass", 2026-09-16). Bridge
          // создаётся автоматически, организатор никогда не видит форму
          // редактирования этого служебного Event, чтобы включить это
          // вручную — без явного true поток "гость видит фестиваль,
          // регистрируется, организатор выдаёт Pass" был бы недостижим ни
          // при каких действиях организатора (найдено при переносе UI,
          // Stage UI-5, при проектировании публичной страницы).
          registrationEnabled: true,
        },
      });

      // Гонка (найдено при ревью, 2026-09-17): `festival.eventId` выше
      // прочитан ДО транзакции — если createFestivalPass вызван дважды
      // параллельно для одного и того же ещё безбриджевого фестиваля, обе
      // попытки увидят eventId=null и обе создадут свой bridge-Event.
      // updateMany с условием "eventId ещё null" — атомарная защита:
      // Postgres не даст второй конкурентной UPDATE увидеть устаревшее
      // null после того, как первая уже закоммитила своё значение. Кто
      // проиграл гонку — использует ЧУЖОЙ (уже записанный) bridge и удаляет
      // свой лишний, чтобы не копить сиротские черновики Event.
      const claim = await tx.festival.updateMany({
        where: { id: festival.id, eventId: null },
        data: { eventId: bridgeEvent.id },
      });

      if (claim.count === 0) {
        await tx.event.delete({ where: { id: bridgeEvent.id } });
        const winner = await tx.festival.findUniqueOrThrow({ where: { id: festival.id } });
        eventId = winner.eventId!;
      } else {
        eventId = bridgeEvent.id;
      }
    }

    return tx.pass.create({
      data: {
        eventId,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        type: input.type,
        price: input.price ?? null,
        currency: input.currency?.trim() || null,
        quantity: input.quantity ?? null,
        salesStartAt: input.salesStartAt ?? null,
        salesEndAt: input.salesEndAt ?? null,
        validFrom: input.validFrom ?? null,
        validUntil: input.validUntil ?? null,
        sortOrder: input.sortOrder ?? 0,
        imageUrl: input.imageUrl?.trim() || null,
        allowMultipleEntry: input.allowMultipleEntry ?? true,
        ...refundFields,
      },
    });
  });
}

// Публикация — переводит bridge-Event в PUBLISHED. Требует, чтобы bridge уже
// существовал (т.е. хотя бы 1 Pass уже создан — см. createFestivalPass) —
// это и есть продуктовое правило "минимум 1 Pass для публикации", здесь оно
// просто проверяется естественным образом через отсутствие eventId, а не
// отдельным подсчётом Pass. Модерация — та же политика, что и у обычного
// Event (decidePublishModeration, переиспользована, а не продублирована).
export async function publishFestival(festivalId: string, user: User): Promise<Event> {
  const festival = await prisma.festival.findUnique({ where: { id: festivalId }, include: { event: true } });
  if (!festival) throw new RegistrationNotFoundError();
  if (!isOwnerOrAdminFestival(festival, user)) throw new RegistrationForbiddenError("forbidden");
  if (!festival.eventId || !festival.event) {
    throw new FestivalValidationError(
      "no_bridge_event",
      "Чтобы опубликовать фестиваль, сначала создайте хотя бы один Pass на вкладке «Пассы»."
    );
  }
  if (festival.event.status === "PUBLISHED") return festival.event; // идемпотентно

  // Festival не привязан к School напрямую — school-based автоодобрение
  // (verified школа-владелец) сюда не применимо, только ADMIN/
  // isVerifiedEventOrganizer у самого пользователя.
  const autoApprove = shouldAutoApproveEvent(user, null);
  const { moderationFields } = decidePublishModeration(festival.event.moderationStatus, autoApprove);

  return prisma.event.update({
    where: { id: festival.eventId },
    data: { status: "PUBLISHED", ...moderationFields },
  });
}
