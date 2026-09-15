import type { EventRegistration, Prisma, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasEventAccess } from "./access";
import { emitDomainEvent } from "../notifications/emit-domain-event";

// Events Engine, этап 2 — регистрация на обычное событие (Party/Masterclass/
// ...). НЕ путать с Registration Competition Engine (Слой 3, J&J с ролями/
// дивизионами) — см. комментарий у модели EventRegistration в schema.prisma.
// Активируется только через Event.registrationEnabled; UI (кнопка на
// публичной странице, вкладка "Участники" у организатора) — следующие,
// отдельные этапы.

export class RegistrationForbiddenError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
export class RegistrationNotFoundError extends Error {}
export class NoDancerProfileError extends Error {}
export class RegistrationClosedError extends Error {}
// QA BUG-004 — переполнение вместимости при переводе WAITLIST -> REGISTERED/
// CONFIRMED организатором (плейн-update без проверки capacity).
export class CapacityExceededError extends Error {}

const ACTIVE_STATUSES: EventRegistration["status"][] = ["REGISTERED", "CONFIRMED"];

function isActiveStatus(status: EventRegistration["status"]): boolean {
  return ACTIVE_STATUSES.includes(status);
}

// QA BUG-006 — освобождение слота (отмена/reject/no-show активной
// регистрации) должно продвигать следующего по очереди WAITLIST, иначе сам
// смысл листа ожидания теряется. Вызывается ТОЛЬКО изнутри транзакции с уже
// взятым advisory-локом на eventId — свободных мест не может "утечь" между
// count() и update() того же вызова.
//
// §20 ТЗ (уведомления о регистрации) — продвинутый по очереди участник не
// делал ничего сам (его подвинуло либо чужое действие организатора, либо
// чья-то самостоятельная отмена), поэтому получает EVENT_REGISTRATION_CONFIRMED
// точно так же, как и при ручном промоушене в updateEventRegistration.
async function promoteNextWaitlisted(
  tx: Prisma.TransactionClient,
  event: { id: string; slug: string; title: string; capacity: number | null }
) {
  if (event.capacity == null) return; // без лимита вместимости WAITLIST в принципе не создаётся, но проверяем явно
  const activeCount = await tx.eventRegistration.count({
    where: { eventId: event.id, status: { in: ACTIVE_STATUSES } },
  });
  if (activeCount >= event.capacity) return;
  const next = await tx.eventRegistration.findFirst({
    where: { eventId: event.id, status: "WAITLIST" },
    orderBy: { createdAt: "asc" },
    include: { dancer: { select: { userId: true } } },
  });
  if (!next) return;

  const promoted = await tx.eventRegistration.update({ where: { id: next.id }, data: { status: "REGISTERED" } });
  await emitDomainEvent(tx, {
    type: "EVENT_REGISTRATION_CONFIRMED",
    payload: { entityId: event.id, eventSlug: event.slug, title: event.title, directUserId: next.dancer.userId },
    idempotencyKey: `EVENT_REGISTRATION_CONFIRMED:${promoted.id}:${promoted.updatedAt.toISOString()}`,
  });
}

async function requireDancer(userId: string) {
  const dancer = await prisma.dancer.findUnique({ where: { userId } });
  if (!dancer) throw new NoDancerProfileError();
  return dancer;
}

async function requireRegistrableEvent(eventId: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw new RegistrationNotFoundError();
  // Регистрация возможна только на реально видимое, живое событие — тот же
  // гейт, что и на публичной странице (status=PUBLISHED И
  // moderationStatus=APPROVED), плюс явный флаг организатора
  // registrationEnabled (Event Engine, уже существующее поле).
  if (!event.registrationEnabled || event.status !== "PUBLISHED" || event.moderationStatus !== "APPROVED") {
    throw new RegistrationClosedError();
  }
  return event;
}

// Самостоятельная регистрация текущего пользователя. Идемпотентно:
// повторный вызов на уже активной регистрации (REGISTERED/CONFIRMED/
// WAITLIST) — no-op, возвращает существующую строку; на CANCELLED —
// реактивирует. REJECTED/NO_SHOW — решение организатора, самостоятельно
// участник его не отменяет (см. RegistrationForbiddenError ниже), обратиться
// нужно к организатору, который меняет статус через updateEventRegistration.
export async function registerForEvent(eventId: string, user: User): Promise<EventRegistration> {
  const dancer = await requireDancer(user.id);
  const event = await requireRegistrableEvent(eventId);

  return prisma.$transaction(async (tx) => {
    // Advisory lock на событие — тот же приём, что и при атомарной подмене
    // места в финале (final-scoring.ts, 2026-09-07): без него два
    // одновременных запроса на последнее свободное место могли бы оба
    // увидеть "ещё есть место" до commit друг друга и оба получить
    // REGISTERED вместо одного REGISTERED + одного WAITLIST.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${eventId}))`;

    const existing = await tx.eventRegistration.findUnique({
      where: { eventId_dancerId: { eventId, dancerId: dancer.id } },
    });
    if (existing && existing.status !== "CANCELLED") {
      if (existing.status === "REJECTED" || existing.status === "NO_SHOW") {
        throw new RegistrationForbiddenError("registration_decided_by_organizer");
      }
      return existing; // уже REGISTERED/CONFIRMED/WAITLIST — идемпотентно
    }

    const status = await resolveInitialStatus(tx, event.id, event.capacity);

    if (existing) {
      return tx.eventRegistration.update({
        where: { id: existing.id },
        data: { status, isPaid: false, paidAt: null, cancelledAt: null },
      });
    }
    return tx.eventRegistration.create({ data: { eventId: event.id, dancerId: dancer.id, status } });
  });
}

async function resolveInitialStatus(
  tx: Prisma.TransactionClient,
  eventId: string,
  capacity: number | null
): Promise<"REGISTERED" | "WAITLIST"> {
  if (capacity == null) return "REGISTERED";
  const activeCount = await tx.eventRegistration.count({
    where: { eventId, status: { in: ACTIVE_STATUSES } },
  });
  return activeCount < capacity ? "REGISTERED" : "WAITLIST";
}

// Самостоятельная отмена — статус, а не физическое удаление строки (история
// регистрации сохраняется, как и везде в проекте, CLAUDE.md §18).
export async function cancelMyRegistration(eventId: string, user: User): Promise<EventRegistration> {
  const dancer = await requireDancer(user.id);

  return prisma.$transaction(async (tx) => {
    // Тот же advisory lock, что и в registerForEvent/updateEventRegistration —
    // отмена может тут же освободить слот и продвинуть WAITLIST (см. ниже),
    // это должно быть атомарно с любой параллельной регистрацией/промоушеном
    // на то же событие.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${eventId}))`;

    const existing = await tx.eventRegistration.findUnique({
      where: { eventId_dancerId: { eventId, dancerId: dancer.id } },
    });
    if (!existing) throw new RegistrationNotFoundError();
    if (existing.status === "CANCELLED") return existing; // идемпотентно
    // QA BUG-005: REJECTED/NO_SHOW — решение организатора, участник не может
    // сам его переписать в CANCELLED (тот же принцип, что уже применён в
    // registerForEvent при попытке самостоятельно реактивировать такую
    // регистрацию, — раньше здесь проверялся только CANCELLED, всё
    // остальное, включая REJECTED/NO_SHOW, безусловно перезаписывалось).
    if (existing.status === "REJECTED" || existing.status === "NO_SHOW") {
      throw new RegistrationForbiddenError("registration_decided_by_organizer");
    }

    const wasActive = isActiveStatus(existing.status);
    const updated = await tx.eventRegistration.update({
      where: { id: existing.id },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });

    if (wasActive) {
      const event = await tx.event.findUniqueOrThrow({
        where: { id: eventId },
        select: { id: true, slug: true, title: true, capacity: true },
      });
      await promoteNextWaitlisted(tx, event);
    }

    return updated;
  });
}

export type RegistrationListPage = {
  items: (EventRegistration & { dancer: { id: string; displayName: string; avatarUrl: string | null } })[];
  total: number;
  page: number;
  pageSize: number;
  // Сводка по ВСЕМ регистрациям события (не только текущей странице) — для
  // KPI-карточек в UI (Stage 3), тот же принцип, что и StatCard в
  // ParticipantsPanel Competition Engine.
  paidCount: number;
  waitlistCount: number;
};

// Список участников — владелец события, ADMIN или член команды события
// (Events Engine, этап 5 — EventTeamMember, любая роль), server-side
// пагинация с самого начала (CLAUDE.md §24 Performance — не грузить весь
// список одним запросом).
export async function listEventRegistrations(
  eventId: string,
  user: User,
  { page = 1, pageSize = 50 }: { page?: number; pageSize?: number } = {}
): Promise<RegistrationListPage> {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw new RegistrationNotFoundError();
  if (!(await hasEventAccess(event, user))) throw new RegistrationForbiddenError("forbidden");

  const safePageSize = Math.min(Math.max(pageSize, 1), 100);
  const safePage = Math.max(page, 1);

  const [items, total, paidCount, waitlistCount] = await Promise.all([
    prisma.eventRegistration.findMany({
      where: { eventId },
      include: { dancer: { select: { id: true, displayName: true, avatarUrl: true } } },
      orderBy: { createdAt: "asc" },
      skip: (safePage - 1) * safePageSize,
      take: safePageSize,
    }),
    prisma.eventRegistration.count({ where: { eventId } }),
    prisma.eventRegistration.count({ where: { eventId, isPaid: true } }),
    prisma.eventRegistration.count({ where: { eventId, status: "WAITLIST" } }),
  ]);

  return { items, total, page: safePage, pageSize: safePageSize, paidCount, waitlistCount };
}

// Организатор/ADMIN меняет статус и/или отметку оплаты — плейн-обновление
// полей, без state-machine (тот же уровень MVP, что и Registration.isPaid
// Competition Engine, см. комментарий у модели). Полноценный workflow с
// проверкой допустимых переходов — избыточен для регистрации на обычное
// событие (Audit.md §"Важные правила" п.9 — не усложнять MVP преждевременно).
export async function updateEventRegistration(
  registrationId: string,
  user: User,
  patch: { status?: EventRegistration["status"]; isPaid?: boolean }
): Promise<EventRegistration> {
  const registration = await prisma.eventRegistration.findUnique({
    where: { id: registrationId },
    include: { event: true, dancer: { select: { userId: true } } },
  });
  if (!registration) throw new RegistrationNotFoundError();
  if (!(await hasEventAccess(registration.event, user))) throw new RegistrationForbiddenError("forbidden");

  // 2026-09-15, по прямому запросу пользователя: CANCELLED — статус, который
  // проставляет только сам участник (cancelMyRegistration), симметрично
  // REJECTED/NO_SHOW, которые может проставить только организатор. Отсюда
  // два независимых правила:
  // 1) организатор не может НАЗНАЧИТЬ CANCELLED напрямую — иначе это было бы
  //    неотличимо от самоотмены, но с потерянной причиной/атрибуцией;
  // 2) организатор не может изменить статус УЖЕ CANCELLED-регистрации —
  //    иначе он мог бы тихо "вернуть" того, кто сам отменился, что молча
  //    отменяет решение участника (CLAUDE.md §60 — по аналогии с запретом
  //    тихо менять чужие решения).
  // Обе проверки — до транзакции/advisory-лока: незачем лочить событие ради
  // запроса, который в любом случае будет отклонён.
  if (patch.status === "CANCELLED") {
    throw new RegistrationForbiddenError("cancelled_status_reserved_for_participant");
  }
  if (patch.status !== undefined && registration.status === "CANCELLED") {
    throw new RegistrationForbiddenError("registration_cancelled_by_participant");
  }

  return prisma.$transaction(async (tx) => {
    // QA BUG-004: тот же advisory lock, что и в registerForEvent — без него
    // организатор (или два team-члена одновременно) мог(ли) промоутить
    // сколько угодно WAITLIST-регистраций в REGISTERED/CONFIRMED мимо
    // Event.capacity, простым plain-update без единой проверки. Лочим здесь
    // же, до повторного чтения текущего статуса — capacity ниже проверяется
    // относительно уже актуального (не устаревшего) состояния.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${registration.eventId}))`;

    const current = await tx.eventRegistration.findUniqueOrThrow({ where: { id: registrationId } });
    const statusChanging = patch.status !== undefined && patch.status !== current.status;
    const wasActive = isActiveStatus(current.status);
    const becomesActive = patch.status !== undefined && isActiveStatus(patch.status);

    if (statusChanging && becomesActive && !wasActive && registration.event.capacity != null) {
      const activeCount = await tx.eventRegistration.count({
        where: { eventId: registration.eventId, status: { in: ACTIVE_STATUSES } },
      });
      if (activeCount >= registration.event.capacity) {
        throw new CapacityExceededError(
          `Нет свободных мест: вместимость ${registration.event.capacity}, уже подтверждено ${activeCount}. Оставьте участника в листе ожидания или сначала освободите место.`
        );
      }
    }

    const updated = await tx.eventRegistration.update({
      where: { id: registrationId },
      data: {
        ...(patch.status ? { status: patch.status } : {}),
        ...(patch.isPaid !== undefined ? { isPaid: patch.isPaid, paidAt: patch.isPaid ? new Date() : null } : {}),
      },
    });

    // §20 ТЗ — уведомить самого участника об организаторском решении по ЕГО
    // регистрации (не про самоотмену — той занимается cancelMyRegistration
    // и туда эти уведомления намеренно не добавлены, человек и так знает,
    // что сам отменился). CANCELLED сюда больше не попадает вообще (см. guard
    // выше) — patch.status здесь гарантированно один из REGISTERED/CONFIRMED/
    // WAITLIST/REJECTED/NO_SHOW.
    if (statusChanging && patch.status) {
      const becomesConfirmed = patch.status === "CONFIRMED" || (becomesActive && !wasActive);
      if (becomesConfirmed) {
        await emitDomainEvent(tx, {
          type: "EVENT_REGISTRATION_CONFIRMED",
          payload: {
            entityId: registration.eventId,
            eventSlug: registration.event.slug,
            title: registration.event.title,
            directUserId: registration.dancer.userId,
          },
          idempotencyKey: `EVENT_REGISTRATION_CONFIRMED:${updated.id}:${updated.updatedAt.toISOString()}`,
        });
      } else if (patch.status === "REJECTED") {
        await emitDomainEvent(tx, {
          type: "EVENT_REGISTRATION_REJECTED",
          payload: {
            entityId: registration.eventId,
            eventSlug: registration.event.slug,
            title: registration.event.title,
            directUserId: registration.dancer.userId,
          },
          idempotencyKey: `EVENT_REGISTRATION_REJECTED:${updated.id}:${updated.updatedAt.toISOString()}`,
        });
      } else if (patch.status === "WAITLIST") {
        // Организатор вручную вернул участника в лист ожидания — это
        // одновременно освобождает его место (см. promoteNextWaitlisted
        // ниже), поэтому демотированный человек должен явно об этом узнать.
        await emitDomainEvent(tx, {
          type: "EVENT_REGISTRATION_WAITLISTED",
          payload: {
            entityId: registration.eventId,
            eventSlug: registration.event.slug,
            title: registration.event.title,
            directUserId: registration.dancer.userId,
          },
          idempotencyKey: `EVENT_REGISTRATION_WAITLISTED:${updated.id}:${updated.updatedAt.toISOString()}`,
        });
      }
    }

    // QA BUG-006: организатор переводит активного участника в REJECTED/
    // NO_SHOW/WAITLIST (CANCELLED сюда больше не попадает, см. guard выше) —
    // освободившееся место автоматически продвигает следующего по очереди
    // WAITLIST (тот же helper, что и в cancelMyRegistration/самоотмене) и сам
    // шлёт EVENT_REGISTRATION_CONFIRMED продвинутому участнику.
    if (statusChanging && wasActive && !becomesActive) {
      await promoteNextWaitlisted(tx, registration.event);
    }

    return updated;
  });
}
