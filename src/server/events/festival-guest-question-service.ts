import type { FestivalGuestQuestion, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireFestivalAccess } from "./festival-service";
import { hasFestivalAccess } from "./access";
import { RegistrationForbiddenError, RegistrationNotFoundError } from "./registration-service";

// Festival Engine — Stage 3 (2026-09-17, docs/FESTIVAL_SERVICE_LAYER_PLAN.md).
// Вопрос гостя — АНОНИМНАЯ форма (без авторизации, решение пользователя),
// в отличие от отзыва (festival-review-service.ts, требует логин). Именно
// поэтому здесь нужен анти-спам лимит по IP — открытый вопрос плана №3,
// решён пользователем: "нужна, без авторизации".
//
// ДВЕ независимые оси состояния (прямое решение пользователя):
// - moderationStatus — виден ли вопрос на публичной странице вообще
//   (спам-фильтр организатора);
// - answer/answeredAt — ответил ли уже организатор.
// Вопрос может быть APPROVED, но без ответа ("Ожидает ответа" в UI);
// PENDING/REJECTED не показывается публично вне зависимости от ответа.

export class FestivalGuestQuestionValidationError extends Error {
  constructor(
    public code: string,
    message?: string
  ) {
    super(message ?? code);
  }
}

export class FestivalGuestQuestionRateLimitError extends Error {
  constructor(message = "Слишком много вопросов подряд — попробуйте позже.") {
    super(message);
  }
}

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 минут
const RATE_LIMIT_MAX_PER_WINDOW = 3;

export type GuestQuestionInput = {
  askerName?: string | null;
  question: string;
  // IP запроса — определяется в API-роуте (заголовки прокси), не здесь.
  // Null — лимит не проверяется (нет откуда взять IP, например в тестах);
  // в реальном роуте всегда передаётся.
  submitterIp?: string | null;
};

function validate(input: { question: string }): void {
  if (!input.question.trim()) {
    throw new FestivalGuestQuestionValidationError("question_required", "Вопрос не может быть пустым.");
  }
}

export async function submitGuestQuestion(festivalId: string, input: GuestQuestionInput): Promise<FestivalGuestQuestion> {
  const festival = await prisma.festival.findUnique({ where: { id: festivalId } });
  if (!festival) throw new RegistrationNotFoundError();
  validate(input);

  if (input.submitterIp) {
    const recentCount = await prisma.festivalGuestQuestion.count({
      where: {
        festivalId,
        submitterIp: input.submitterIp,
        createdAt: { gte: new Date(Date.now() - RATE_LIMIT_WINDOW_MS) },
      },
    });
    if (recentCount >= RATE_LIMIT_MAX_PER_WINDOW) {
      throw new FestivalGuestQuestionRateLimitError();
    }
  }

  return prisma.festivalGuestQuestion.create({
    data: {
      festivalId,
      askerName: input.askerName?.trim() || null,
      question: input.question.trim(),
      submitterIp: input.submitterIp ?? null,
      moderationStatus: "PENDING",
    },
  });
}

async function requireAccessForQuestion(itemId: string, user: User) {
  const item = await prisma.festivalGuestQuestion.findUnique({ where: { id: itemId }, include: { festival: true } });
  if (!item) throw new RegistrationNotFoundError();
  if (!(await hasFestivalAccess(item.festival, user))) throw new RegistrationForbiddenError("forbidden");
  return item;
}

export async function moderateGuestQuestion(
  itemId: string,
  moderator: User,
  decision: "APPROVED" | "REJECTED"
): Promise<FestivalGuestQuestion> {
  await requireAccessForQuestion(itemId, moderator);
  return prisma.festivalGuestQuestion.update({
    where: { id: itemId },
    data: { moderationStatus: decision, moderatedById: moderator.id, moderatedAt: new Date() },
  });
}

export async function answerGuestQuestion(itemId: string, organizer: User, answer: string): Promise<FestivalGuestQuestion> {
  await requireAccessForQuestion(itemId, organizer);
  if (!answer.trim()) {
    throw new FestivalGuestQuestionValidationError("answer_required", "Ответ не может быть пустым.");
  }
  return prisma.festivalGuestQuestion.update({
    where: { id: itemId },
    data: { answer: answer.trim(), answeredById: organizer.id, answeredAt: new Date() },
  });
}

// Очередь организатора — ВСЕ вопросы (включая ещё не одобренные).
export async function listGuestQuestions(festivalId: string, user: User): Promise<FestivalGuestQuestion[]> {
  await requireFestivalAccess(festivalId, user);
  return prisma.festivalGuestQuestion.findMany({ where: { festivalId }, orderBy: { createdAt: "desc" } });
}

// Публичная — только одобренные, без RBAC (будущая публичная страница).
export async function listPublicGuestQuestions(festivalId: string): Promise<FestivalGuestQuestion[]> {
  return prisma.festivalGuestQuestion.findMany({
    where: { festivalId, moderationStatus: "APPROVED" },
    orderBy: { createdAt: "desc" },
  });
}
