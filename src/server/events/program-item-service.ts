import type { FestivalProgramItemType, ProgramItem, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasFestivalAccess } from "./access";
import { requireFestivalAccess } from "./festival-service";
import { EventsValidationError, RegistrationForbiddenError, RegistrationNotFoundError } from "./registration-service";

// Festival Engine — CRUD пунктов программы (2026-09-17, план
// docs/FESTIVAL_SERVICE_LAYER_PLAN.md, Stage 1). RBAC — тот же
// hasFestivalAccess, что и у самого Festival (владелец/ADMIN, плюс команда
// bridge-Event, когда она уже есть).

export class ProgramItemValidationError extends EventsValidationError {}

export type ProgramItemInput = {
  title: string;
  type: FestivalProgramItemType;
  startTime: Date;
  endTime?: Date | null;
  teacherId?: string | null;
  linkedEventId?: string | null;
  order?: number;
  // Лимит мест на ЭТОТ пункт программы + переключатель публичного показа
  // остатка — отдельно от того, сколько Pass продано на весь фестиваль
  // (docs/FESTIVAL_UI_TO_DB_PLAN.md).
  capacity?: number | null;
  showCapacityPublicly?: boolean;
};

function validateProgramItemInput(input: Partial<ProgramItemInput>): void {
  if (input.title !== undefined && !input.title.trim()) {
    throw new ProgramItemValidationError("title_required", "Название пункта программы обязательно.");
  }
  if (input.startTime && input.endTime && input.startTime > input.endTime) {
    throw new ProgramItemValidationError("invalid_time_window", "Начало не может быть позже окончания.");
  }
  if (input.capacity != null && (!Number.isInteger(input.capacity) || input.capacity <= 0)) {
    throw new ProgramItemValidationError("invalid_capacity", "Вместимость должна быть положительным целым числом.");
  }
}

async function requireAccessForItem(itemId: string, user: User) {
  const item = await prisma.programItem.findUnique({ where: { id: itemId }, include: { festival: true } });
  if (!item) throw new RegistrationNotFoundError();
  if (!(await hasFestivalAccess(item.festival, user))) throw new RegistrationForbiddenError("forbidden");
  return item;
}

export async function createProgramItem(festivalId: string, user: User, input: ProgramItemInput): Promise<ProgramItem> {
  await requireFestivalAccess(festivalId, user);
  validateProgramItemInput(input);

  return prisma.programItem.create({
    data: {
      festivalId,
      title: input.title.trim(),
      type: input.type,
      startTime: input.startTime,
      endTime: input.endTime ?? null,
      teacherId: input.teacherId || null,
      linkedEventId: input.linkedEventId || null,
      order: input.order ?? 0,
      capacity: input.capacity ?? null,
      showCapacityPublicly: input.showCapacityPublicly ?? true,
    },
  });
}

export async function updateProgramItem(itemId: string, user: User, patch: Partial<ProgramItemInput>): Promise<ProgramItem> {
  await requireAccessForItem(itemId, user);
  validateProgramItemInput(patch);

  return prisma.programItem.update({
    where: { id: itemId },
    data: {
      ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
      ...(patch.type !== undefined ? { type: patch.type } : {}),
      ...(patch.startTime !== undefined ? { startTime: patch.startTime } : {}),
      ...(patch.endTime !== undefined ? { endTime: patch.endTime } : {}),
      ...(patch.teacherId !== undefined ? { teacherId: patch.teacherId || null } : {}),
      ...(patch.linkedEventId !== undefined ? { linkedEventId: patch.linkedEventId || null } : {}),
      ...(patch.order !== undefined ? { order: patch.order } : {}),
      ...(patch.capacity !== undefined ? { capacity: patch.capacity } : {}),
      ...(patch.showCapacityPublicly !== undefined ? { showCapacityPublicly: patch.showCapacityPublicly } : {}),
    },
  });
}

export async function deleteProgramItem(itemId: string, user: User): Promise<void> {
  await requireAccessForItem(itemId, user);
  await prisma.programItem.delete({ where: { id: itemId } });
}

export async function listProgramItems(festivalId: string, user: User): Promise<ProgramItem[]> {
  await requireFestivalAccess(festivalId, user);
  return prisma.programItem.findMany({ where: { festivalId }, orderBy: { order: "asc" } });
}
