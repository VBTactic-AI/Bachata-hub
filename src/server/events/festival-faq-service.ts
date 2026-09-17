import type { FestivalFaqItem, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireFestivalAccess } from "./festival-service";
import { hasFestivalAccess } from "./access";
import { EventsValidationError, RegistrationForbiddenError, RegistrationNotFoundError } from "./registration-service";

// Festival Engine — Stage 2 (2026-09-17). FAQ, который ведёт организатор —
// показывается аккордеоном на публичной странице фестиваля. НЕ то же самое,
// что FestivalGuestQuestion (вопросы от гостей, отдельный сервис, Stage 3).

export class FestivalFaqItemValidationError extends EventsValidationError {}

export type FestivalFaqItemInput = {
  question: string;
  answer: string;
  sortOrder?: number;
};

function validate(input: Partial<FestivalFaqItemInput>): void {
  if (input.question !== undefined && !input.question.trim()) {
    throw new FestivalFaqItemValidationError("question_required", "Вопрос обязателен.");
  }
  if (input.answer !== undefined && !input.answer.trim()) {
    throw new FestivalFaqItemValidationError("answer_required", "Ответ обязателен.");
  }
}

export async function createFestivalFaqItem(festivalId: string, user: User, input: FestivalFaqItemInput): Promise<FestivalFaqItem> {
  await requireFestivalAccess(festivalId, user);
  validate(input);

  return prisma.festivalFaqItem.create({
    data: {
      festivalId,
      question: input.question.trim(),
      answer: input.answer.trim(),
      sortOrder: input.sortOrder ?? 0,
    },
  });
}

async function requireAccessForFaqItem(itemId: string, user: User) {
  const item = await prisma.festivalFaqItem.findUnique({ where: { id: itemId }, include: { festival: true } });
  if (!item) throw new RegistrationNotFoundError();
  if (!(await hasFestivalAccess(item.festival, user))) throw new RegistrationForbiddenError("forbidden");
  return item;
}

export async function updateFestivalFaqItem(
  itemId: string,
  user: User,
  patch: Partial<FestivalFaqItemInput>
): Promise<FestivalFaqItem> {
  await requireAccessForFaqItem(itemId, user);
  validate(patch);

  return prisma.festivalFaqItem.update({
    where: { id: itemId },
    data: {
      ...(patch.question !== undefined ? { question: patch.question.trim() } : {}),
      ...(patch.answer !== undefined ? { answer: patch.answer.trim() } : {}),
      ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
    },
  });
}

export async function deleteFestivalFaqItem(itemId: string, user: User): Promise<void> {
  await requireAccessForFaqItem(itemId, user);
  await prisma.festivalFaqItem.delete({ where: { id: itemId } });
}

export async function listFestivalFaqItems(festivalId: string, user: User): Promise<FestivalFaqItem[]> {
  await requireFestivalAccess(festivalId, user);
  return prisma.festivalFaqItem.findMany({ where: { festivalId }, orderBy: { sortOrder: "asc" } });
}
