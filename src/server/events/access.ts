import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Events Engine, этап 5 — общая проверка доступа к управлению ОДНИМ
// конкретным событием, переиспользуется registration-service.ts и
// team-service.ts (вынесено в отдельный модуль, чтобы не создавать
// циклический импорт между ними). Владелец события (Event.createdById) или
// сайтовый ADMIN — всегда; иначе — есть строка в EventTeamMember (любая
// роль, см. комментарий у модели в schema.prisma про минимальную RBAC-модель
// этой версии).
export function isOwnerOrAdmin(event: { createdById: string }, user: User): boolean {
  return event.createdById === user.id || user.role === "ADMIN";
}

export async function hasEventAccess(event: { id: string; createdById: string }, user: User): Promise<boolean> {
  if (isOwnerOrAdmin(event, user)) return true;
  const membership = await prisma.eventTeamMember.findUnique({
    where: { eventId_userId: { eventId: event.id, userId: user.id } },
  });
  return !!membership;
}

// Festival Engine (2026-09-17, docs/FESTIVAL_SERVICE_LAYER_PLAN.md) — тот же
// принцип, что и isOwnerOrAdmin/hasEventAccess выше, но для Festival:
// createdById или ADMIN — всегда.
export function isOwnerOrAdminFestival(festival: { createdById: string }, user: User): boolean {
  return festival.createdById === user.id || user.role === "ADMIN";
}

// До появления bridge-Event (Festival.eventId == null) команда недоступна
// вообще — только владелец+ADMIN, осознанное ограничение черновика (см.
// docs/FESTIVAL_ENGINE_ER.md, раздел "вне скоупа"). После — как и у Event,
// через EventTeamMember УЖЕ СУЩЕСТВУЮЩЕГО bridge-события — Festival не
// заводит собственную FestivalTeamMember.
export async function hasFestivalAccess(
  festival: { id: string; createdById: string; eventId: string | null },
  user: User
): Promise<boolean> {
  if (isOwnerOrAdminFestival(festival, user)) return true;
  if (!festival.eventId) return false;
  const membership = await prisma.eventTeamMember.findUnique({
    where: { eventId_userId: { eventId: festival.eventId, userId: user.id } },
  });
  return !!membership;
}
