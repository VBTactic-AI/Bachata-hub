import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isOwnerOrAdminFestival } from "./access";
import { EventsValidationError, RegistrationForbiddenError, RegistrationNotFoundError } from "./registration-service";
import { sendBroadcast, type SendBroadcastResult } from "@/server/notifications/broadcast";

// Festival Engine — Stage 5 (2026-09-17, docs/FESTIVAL_SERVICE_LAYER_PLAN.md).
// Рассылка держателям конкретного Pass — ОТДЕЛЬНАЯ, узкая точка входа, НЕ
// через сайтовый BroadcastComposer.tsx (тот инструмент — общий Control
// Center для ВСЕХ админов сайта и ВСЕХ Pass, гейт там isAdmin(); обычный
// организатор фестиваля туда доступа не имеет и не должен получить — прямое
// решение пользователя, см. docs/PROGRESS.md "схема БД под UI-фичи",
// решение №1). RBAC здесь — именно isOwnerOrAdminFestival (владелец
// фестиваля + сайтовый ADMIN), НЕ hasFestivalAccess/команда — рассылка
// уходит на весь список держателей Pass разом, более чувствительное
// действие, чем обычное редактирование контента фестиваля (тот же более
// узкий гейт, что уже используют archiveFestival/deleteFestivalDraft в
// festival-service.ts).

export class FestivalBroadcastValidationError extends EventsValidationError {}

// passId должен принадлежать ЭТОМУ фестивалю — либо это Pass на его
// bridge-Event (обычный Festival Pass, createFestivalPass), либо Pass на
// одном из дочерних событий программы (ProgramItem.linkedEvent), если у
// такого пункта программы есть собственная, отдельно продаваемая точка
// доступа. Pass чужого события/фестиваля рассылку получить не должен.
async function isPassOfFestival(festivalId: string, passId: string): Promise<boolean> {
  const pass = await prisma.pass.findUnique({ where: { id: passId }, select: { eventId: true } });
  if (!pass) return false;

  const festival = await prisma.festival.findUnique({ where: { id: festivalId }, select: { eventId: true } });
  if (festival?.eventId != null && festival.eventId === pass.eventId) return true;

  const linkedProgramItem = await prisma.programItem.findFirst({
    where: { festivalId, linkedEventId: pass.eventId },
    select: { id: true },
  });
  return !!linkedProgramItem;
}

export type FestivalPassBroadcastInput = {
  title: string;
  body: string;
  clientRequestId: string;
};

export async function sendFestivalPassBroadcast(
  festivalId: string,
  passId: string,
  user: User,
  input: FestivalPassBroadcastInput
): Promise<SendBroadcastResult> {
  const festival = await prisma.festival.findUnique({ where: { id: festivalId } });
  if (!festival) throw new RegistrationNotFoundError();
  if (!isOwnerOrAdminFestival(festival, user)) throw new RegistrationForbiddenError("forbidden");

  if (!(await isPassOfFestival(festivalId, passId))) {
    throw new FestivalBroadcastValidationError("pass_not_in_festival", "Этот Pass не относится к программе данного фестиваля.");
  }

  // Валидация текста/аудитории (title/body непустые, targetId существует),
  // резолв держателей и сама отправка — уже существующий Delivery Engine,
  // переиспользуется целиком (sendBroadcast), не дублируется здесь.
  return sendBroadcast({
    sentById: user.id,
    audience: { kind: "SUBSCRIBERS", type: "PASS", targetId: passId },
    title: input.title,
    body: input.body,
    clientRequestId: input.clientRequestId,
  });
}
