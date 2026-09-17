import type { Prisma, TicketCheckIn, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAccessForTicket, TicketValidationError } from "./ticket-service";
import { hasEventAccess } from "./access";
import { RegistrationForbiddenError, RegistrationNotFoundError } from "./registration-service";

// TicketCheckIn (Commerce Engine v1, 2026-09-17) — факт явки ПО КОНКРЕТНОМУ
// Ticket. Отдельно от EventRegistration.checkedInAt (явка на само событие
// вообще — другой домен) и от Competition Engine CheckIn (JNJ — тоже другой
// домен). Доступ — hasEventAccess, тот же принцип, что и у остального
// повседневного управления билетами в ticket-service.ts (не isOwnerOrAdmin —
// на входе может стоять любой член команды, не только владелец события).

// REFUNDED/CANCELLED — билет-призрак, вход по нему невозможен (CLAUDE.md §21:
// после возврата доступ отзывается). ISSUED — единственный статус, с которого
// разрешён check-in.
function assertCheckable(ticket: { status: string }): void {
  if (ticket.status !== "ISSUED") {
    throw new TicketValidationError(
      "ticket_not_checkinable",
      ticket.status === "REFUNDED"
        ? "Билет возвращён — вход по нему больше недействителен."
        : "Билет отменён — вход по нему невозможен."
    );
  }
}

// Идемпотентно: повторный скан того же QR/повторное нажатие "Отметить явку"
// не создаёт вторую запись (TicketCheckIn.ticketId уникален) — возвращает уже
// существующую (тот же принцип, что и issueFestivalPassEntry в
// ticket-service.ts — "уже сделано" не ошибка).
export async function checkInTicket(
  ticketId: string,
  user: User,
  method: "QR" | "MANUAL" | "ADMIN" = "MANUAL"
): Promise<TicketCheckIn> {
  const ticket = await requireAccessForTicket(ticketId, user);
  assertCheckable(ticket);

  try {
    return await prisma.ticketCheckIn.create({
      data: { ticketId, checkedInById: user.id, method },
    });
  } catch (err) {
    if ((err as Prisma.PrismaClientKnownRequestError)?.code === "P2002") {
      return prisma.ticketCheckIn.findUniqueOrThrow({ where: { ticketId } });
    }
    throw err;
  }
}

// Отменяет ошибочную отметку (тот же принцип, что и cancelCheckIn() в
// Competition Engine, docs/00_DECISIONS.md A35) — физически удаляет строку,
// билет снова доступен для check-in. No-op, если явки не было вообще.
export async function cancelTicketCheckIn(ticketId: string, user: User): Promise<void> {
  await requireAccessForTicket(ticketId, user);
  await prisma.ticketCheckIn.deleteMany({ where: { ticketId } });
}

export async function getTicketCheckIn(ticketId: string, user: User): Promise<TicketCheckIn | null> {
  await requireAccessForTicket(ticketId, user);
  return prisma.ticketCheckIn.findUnique({ where: { ticketId } });
}

// Список явок события (для будущего экрана "Кто уже вошёл") — сортировка по
// времени явки, самые новые сверху.
export async function listCheckInsForEvent(eventId: string, user: User) {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw new RegistrationNotFoundError();
  if (!(await hasEventAccess(event, user))) throw new RegistrationForbiddenError("forbidden");

  return prisma.ticketCheckIn.findMany({
    where: { ticket: { eventId } },
    include: { ticket: { include: { dancer: { select: { id: true, displayName: true, avatarUrl: true } } } } },
    orderBy: { checkedInAt: "desc" },
  });
}
