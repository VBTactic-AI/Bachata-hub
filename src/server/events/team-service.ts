import type { EventTeamMember, EventTeamRole, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { RegistrationForbiddenError, RegistrationNotFoundError } from "./registration-service";
import { isOwnerOrAdmin } from "./access";
import { buildNameFilter } from "../competition/search-dancers";

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
    // dancer.displayName (2026-09-18) — раз участника теперь ищут и
    // добавляют по имени, список тоже должен показывать имя, не только
    // email (иначе организатор не узнает, кого только что добавил).
    include: { user: { select: { id: true, email: true, dancer: { select: { displayName: true } } } } },
    orderBy: { createdAt: "asc" },
  });
}

export type TeamMemberSearchResult = { userId: string; displayName: string; email: string };

// Поиск существующего пользователя по имени (2026-09-18, по прямому
// запросу пользователя — заменяет прежний точный email, организатор редко
// помнит точный адрес, а имя обычно знает). Ищет по Dancer.displayName —
// тот же паттерн (и buildNameFilter), что и searchDancersByName в
// Competition Engine. Пользователь без своего Dancer-профиля через этот
// поиск не найдётся — приемлемое ограничение: приглашаемые в команду
// события уже зарегистрированы как танцоры на платформе.
export async function searchUsersForTeam(eventId: string, actingUser: User, query: string): Promise<TeamMemberSearchResult[]> {
  await requireOwnerOrAdmin(eventId, actingUser);

  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const dancers = await prisma.dancer.findMany({
    where: { displayName: buildNameFilter(trimmed) },
    include: { user: { select: { id: true, email: true } } },
    orderBy: { displayName: "asc" },
    take: 10,
  });

  return dancers.map((d) => ({ userId: d.user.id, displayName: d.displayName, email: d.user.email }));
}

// targetUserId приходит из searchUsersForTeam выше (организатор выбирает из
// результатов поиска, не вводит вручную) — findUnique здесь всё равно
// проверяет существование на сервере (CLAUDE.md §19/§43 — не доверяй
// данным из браузера), не полагается на то, что клиент передал валидный id.
export async function addTeamMember(
  eventId: string,
  actingUser: User,
  targetUserId: string,
  role: EventTeamRole
): Promise<EventTeamMember> {
  const event = await requireOwnerOrAdmin(eventId, actingUser);

  const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!targetUser) throw new EventTeamValidationError("Пользователь не найден.");
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
