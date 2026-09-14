import type { EventRegistration, Prisma, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasEventAccess } from "./access";

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
    where: { eventId, status: { in: ["REGISTERED", "CONFIRMED"] } },
  });
  return activeCount < capacity ? "REGISTERED" : "WAITLIST";
}

// Самостоятельная отмена — статус, а не физическое удаление строки (история
// регистрации сохраняется, как и везде в проекте, CLAUDE.md §18).
export async function cancelMyRegistration(eventId: string, user: User): Promise<EventRegistration> {
  const dancer = await requireDancer(user.id);
  const existing = await prisma.eventRegistration.findUnique({
    where: { eventId_dancerId: { eventId, dancerId: dancer.id } },
  });
  if (!existing) throw new RegistrationNotFoundError();
  if (existing.status === "CANCELLED") return existing; // идемпотентно

  return prisma.eventRegistration.update({
    where: { id: existing.id },
    data: { status: "CANCELLED", cancelledAt: new Date() },
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
    include: { event: true },
  });
  if (!registration) throw new RegistrationNotFoundError();
  if (!(await hasEventAccess(registration.event, user))) throw new RegistrationForbiddenError("forbidden");

  return prisma.eventRegistration.update({
    where: { id: registrationId },
    data: {
      ...(patch.status ? { status: patch.status, ...(patch.status === "CANCELLED" ? { cancelledAt: new Date() } : {}) } : {}),
      ...(patch.isPaid !== undefined ? { isPaid: patch.isPaid, paidAt: patch.isPaid ? new Date() : null } : {}),
    },
  });
}
