import type { EventTeamMember, EventTeamRole, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { RegistrationForbiddenError, RegistrationNotFoundError } from "./registration-service";
import { isOwnerOrAdmin } from "./access";

// Events Engine, этап 5 — совместное управление событием. Минимальная
// RBAC-модель (см. комментарий у EventTeamMember в schema.prisma): OWNER —
// это Event.createdById, не строка в этой таблице. Управлять составом
// команды (добавлять/убирать) может только владелец события или ADMIN —
// делегирование этого права участникам команды сознательно не реализовано
// в этой версии (Audit.md §"Важные правила" — не усложнять MVP).

export class EventTeamValidationError extends Error {}

async function requireOwnerOrAdmin(eventId: string, user: User) {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw new RegistrationNotFoundError();
  if (!isOwnerOrAdmin(event, user)) throw new RegistrationForbiddenError("forbidden");
  return event;
}

export async function listTeamMembers(eventId: string, user: User) {
  await requireOwnerOrAdmin(eventId, user);
  return prisma.eventTeamMember.findMany({
    where: { eventId },
    include: { user: { select: { id: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
}

// Ищем по точному email (не по свободному поиску/автокомплиту — задание
// сознательно проще: организатор сам знает, кого приглашает, это не
// публичный каталог пользователей).
export async function addTeamMember(
  eventId: string,
  actingUser: User,
  targetEmail: string,
  role: EventTeamRole
): Promise<EventTeamMember> {
  const event = await requireOwnerOrAdmin(eventId, actingUser);

  const targetUser = await prisma.user.findUnique({ where: { email: targetEmail.trim().toLowerCase() } });
  if (!targetUser) throw new EventTeamValidationError("Пользователь с таким email не найден.");
  if (targetUser.id === event.createdById) {
    throw new EventTeamValidationError("Этот пользователь уже владелец события.");
  }

  return prisma.eventTeamMember.upsert({
    where: { eventId_userId: { eventId, userId: targetUser.id } },
    create: { eventId, userId: targetUser.id, role, invitedById: actingUser.id },
    update: { role },
  });
}

export async function removeTeamMember(eventId: string, actingUser: User, memberUserId: string): Promise<void> {
  await requireOwnerOrAdmin(eventId, actingUser);
  await prisma.eventTeamMember.deleteMany({ where: { eventId, userId: memberUserId } });
}
