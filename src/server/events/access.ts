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
