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

// §"Door check-in" ТЗ (2026-09-16, по прямому решению пользователя) — NO_SHOW
// остаётся реальным хранимым статусом (не вычисляется на лету, как в JNJ),
// но организатор больше не выбирает его вручную (см.
// EventRegistrationStatusSelect.tsx — убран из списка). Вместо этого он
// проставляется автоматически, когда событие уже прошло (event.endsAt, а
// если не указано — event.startsAt), а check-in так и не случился. Вызывается
// из всех read-путей (listEventRegistrations/getEventRegistrationStatistics/
// exportEventRegistrationsCsv) — eventually-consistent обновление при
// следующем просмотре события, без отдельной cron-инфраструктуры (сравните с
// Notification Engine, где гарантия доставки реально нужна — здесь
// достаточно "поправится при следующем открытии вкладки организатором").
export async function syncNoShowForEvent(event: { id: string; startsAt: Date; endsAt: Date | null }): Promise<void> {
  const eventEndedAt = event.endsAt ?? event.startsAt;
  if (eventEndedAt > new Date()) return;

  await prisma.eventRegistration.updateMany({
    where: { eventId: event.id, status: { in: ACTIVE_STATUSES }, checkedInAt: null },
    data: { status: "NO_SHOW" },
  });
}

// Door check-in — кнопка-тумблер в "Участники" (по образцу CheckInToggle
// Competition Engine, но без отдельной таблицы, см. комментарий у поля в
// schema.prisma). Не через updateEventRegistration() — это независимая ось
// от status/isPaid, со своим единственным особым случаем: включение check-in
// у человека, которого уже автоматически перевели в NO_SHOW, отменяет это
// решение (он всё-таки пришёл) и возвращает его в REGISTERED.
export async function toggleEventRegistrationCheckIn(
  registrationId: string,
  user: User,
  checkedIn: boolean
): Promise<EventRegistration> {
  const registration = await prisma.eventRegistration.findUnique({
    where: { id: registrationId },
    include: { event: true },
  });
  if (!registration) throw new RegistrationNotFoundError();
  if (!(await hasEventAccess(registration.event, user))) throw new RegistrationForbiddenError("forbidden");

  // Симметрично остальным полям — самоотменённая регистрация заморожена для
  // организатора целиком (см. updateEventRegistration), check-in не исключение.
  if (registration.status === "CANCELLED") {
    throw new RegistrationForbiddenError("registration_cancelled_by_participant");
  }

  return prisma.eventRegistration.update({
    where: { id: registrationId },
    data: checkedIn
      ? {
          checkedInAt: new Date(),
          checkedInById: user.id,
          ...(registration.status === "NO_SHOW" ? { status: "REGISTERED" as const } : {}),
        }
      : { checkedInAt: null, checkedInById: null },
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
        data: { status, cancelledAt: null },
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
  // Сколько строк подходит под ТЕКУЩИЙ фильтр — используется для пагинации
  // ("страница X из Y найденного"), меняется вместе с search/status.
  total: number;
  // Сколько всего регистраций у события БЕЗ фильтра — для KPI-карточек
  // (Stage 3, тот же принцип, что и StatCard в ParticipantsPanel Competition
  // Engine).
  totalOverall: number;
  page: number;
  pageSize: number;
  // paidCount больше НЕ считается здесь (2026-09-16, Ticket Engine) — оплата
  // теперь живёт в Ticket (см. ticket-service.ts::getEventPaymentSummaryCounts),
  // не в этой модели; страница считает её отдельным запросом по dancerId'ам
  // текущей выборки.
  waitlistCount: number;
};

export type RegistrationSortBy = "date" | "name";
export type RegistrationSortDir = "asc" | "desc";

// §11 ТЗ (Event CRM) — поиск/фильтры/сортировка. Один и тот же where/orderBy
// нужен и постраничному списку (listEventRegistrations), и экспорту
// (registration-export.ts) — вынесено сюда, чтобы не разойтись.
//
// isPaid убран отсюда (2026-09-16) — оплата больше не поле EventRegistration
// (см. ticket-service.ts), фильтр/сортировка по оплате через агрегат по
// Ticket сюда пока не переносились (не выражается простым Prisma where/
// orderBy без отдельного join — см. docs/PROGRESS.md).
export type RegistrationFilter = {
  search?: string; // подстрока имени участника, без учёта регистра
  status?: EventRegistration["status"];
  // Drill-down с вкладки "Билеты" (?pass=<passId>, 2026-09-16) — конкретный
  // список dancerId уже вычислен вызывающей стороной (по Ticket.passId, см.
  // registrations/page.tsx), здесь просто обычный `in`-фильтр по dancerId,
  // без агрегации оплаты (та по-прежнему не выражается простым where).
  dancerIds?: string[];
  sortBy?: RegistrationSortBy;
  sortDir?: RegistrationSortDir;
};

export function buildRegistrationWhere(eventId: string, filter: RegistrationFilter): Prisma.EventRegistrationWhereInput {
  const search = filter.search?.trim();
  return {
    eventId,
    ...(search ? { dancer: { displayName: { contains: search, mode: "insensitive" } } } : {}),
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.dancerIds ? { dancerId: { in: filter.dancerIds } } : {}),
  };
}

export function buildRegistrationOrderBy(
  sortBy: RegistrationSortBy = "date",
  sortDir: RegistrationSortDir = "asc"
): Prisma.EventRegistrationOrderByWithRelationInput {
  if (sortBy === "name") return { dancer: { displayName: sortDir } };
  return { createdAt: sortDir };
}

// Список участников — владелец события, ADMIN или член команды события
// (Events Engine, этап 5 — EventTeamMember, любая роль), server-side
// пагинация с самого начала (CLAUDE.md §24 Performance — не грузить весь
// список одним запросом). Поиск/фильтры/сортировка — тоже server-side (§11
// ТЗ), а не client-side по уже загруженной странице: иначе фильтр видел бы
// только текущие 50 строк, а не всех участников события.
export async function listEventRegistrations(
  eventId: string,
  user: User,
  { page = 1, pageSize = 50, ...filter }: { page?: number; pageSize?: number } & RegistrationFilter = {}
): Promise<RegistrationListPage> {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw new RegistrationNotFoundError();
  if (!(await hasEventAccess(event, user))) throw new RegistrationForbiddenError("forbidden");
  await syncNoShowForEvent(event);

  const safePageSize = Math.min(Math.max(pageSize, 1), 100);
  const safePage = Math.max(page, 1);
  const where = buildRegistrationWhere(eventId, filter);

  const [items, total, totalOverall, waitlistCount] = await Promise.all([
    prisma.eventRegistration.findMany({
      where,
      include: { dancer: { select: { id: true, displayName: true, avatarUrl: true } } },
      orderBy: buildRegistrationOrderBy(filter.sortBy, filter.sortDir),
      skip: (safePage - 1) * safePageSize,
      take: safePageSize,
    }),
    prisma.eventRegistration.count({ where }),
    prisma.eventRegistration.count({ where: { eventId } }),
    prisma.eventRegistration.count({ where: { eventId, status: "WAITLIST" } }),
  ]);

  return { items, total, totalOverall, page: safePage, pageSize: safePageSize, waitlistCount };
}

// Организатор/ADMIN меняет статус — плейн-обновление поля, без
// state-machine (Audit.md §"Важные правила" п.9 — не усложнять MVP
// преждевременно). Отметка оплаты сюда больше не входит (2026-09-16) — см.
// ticket-service.ts::markRegistrationPayment/updateTicketPayment.
export async function updateEventRegistration(
  registrationId: string,
  user: User,
  patch: { status?: EventRegistration["status"] }
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
  // 2026-09-16, по прямому решению пользователя (Door check-in): NO_SHOW
  // больше нельзя назначить вручную — только автоматически, через
  // syncNoShowForEvent()/toggleEventRegistrationCheckIn(). В отличие от
  // CANCELLED, регистрация НЕ замораживается целиком — организатор может
  // переключить УЖЕ NO_SHOW обратно в любой другой статус (или просто
  // отметить check-in — см. toggleEventRegistrationCheckIn), только не
  // назначить NO_SHOW заново тем же способом.
  if (patch.status === "NO_SHOW") {
    throw new RegistrationForbiddenError("no_show_status_reserved_for_checkin");
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
