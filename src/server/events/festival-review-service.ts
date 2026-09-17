import type { Review, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logModeration } from "@/lib/moderation";
import { hasFestivalAccess } from "./access";
import { EventsValidationError, RegistrationForbiddenError, RegistrationNotFoundError } from "./registration-service";

// Festival Engine — Stage 3 (2026-09-17, docs/FESTIVAL_SERVICE_LAYER_PLAN.md).
// Отзыв о фестивале — РАСШИРЕНИЕ уже существующей модели Review (не
// отдельная сущность, решение пользователя), ровно тот же принцип, что и у
// отзывов школ: требует авторизации (authorId обязателен в схеме — Review
// НЕ поддерживает полностью анонимные записи), видим публично только после
// модерации. КЛЮЧЕВОЕ ОТЛИЧИЕ от отзывов школ: модератора отзыва фестиваля
// назначает сам организатор ЭТОГО фестиваля (isOwnerOrAdminFestival/
// hasFestivalAccess), а не сайтовый MODERATOR/ADMIN — прямое решение
// пользователя (см. план, раздел 2, решение №3).

export class FestivalReviewValidationError extends EventsValidationError {}

export type FestivalReviewInput = {
  rating: number;
  text: string;
};

function validate(input: FestivalReviewInput): void {
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    throw new FestivalReviewValidationError("invalid_rating", "Оценка должна быть целым числом от 1 до 5.");
  }
  if (!input.text.trim()) {
    throw new FestivalReviewValidationError("text_required", "Текст отзыва обязателен.");
  }
}

// Отзыв виден только автору и модератору (организатору фестиваля), пока
// moderationStatus не станет APPROVED — тот же принцип, что и у отзывов
// школ. Право оставить отзыв не завязано на hasFestivalAccess — это
// действие ГОСТЯ фестиваля (любого авторизованного пользователя), не
// организатора.
export async function submitFestivalReview(festivalId: string, user: User, input: FestivalReviewInput): Promise<Review> {
  const festival = await prisma.festival.findUnique({ where: { id: festivalId } });
  if (!festival) throw new RegistrationNotFoundError();
  validate(input);

  return prisma.review.create({
    data: {
      festivalId,
      authorId: user.id,
      rating: input.rating,
      text: input.text.trim(),
      moderationStatus: "PENDING",
    },
  });
}

export async function moderateFestivalReview(reviewId: string, moderator: User, decision: "APPROVED" | "REJECTED"): Promise<Review> {
  const review = await prisma.review.findUnique({ where: { id: reviewId }, include: { festival: true } });
  if (!review) throw new RegistrationNotFoundError();
  if (!review.festivalId || !review.festival) {
    throw new FestivalReviewValidationError("not_festival_review", "Это отзыв о школе, а не о фестивале — модерируется отдельно.");
  }
  if (!(await hasFestivalAccess(review.festival, moderator))) throw new RegistrationForbiddenError("forbidden");

  const updated = await prisma.review.update({
    where: { id: reviewId },
    data: { moderationStatus: decision, moderatedById: moderator.id },
  });

  // Тот же общий audit log, что и у модерации отзывов школ (entity "REVIEW"
  // уже существует и не специфичен для школ) — не заводим отдельный тип
  // сущности только ради фестивалей.
  await logModeration(moderator, "REVIEW", updated.id, decision === "APPROVED" ? "approve" : "reject");

  return updated;
}

// Очередь модерации организатора — ВСЕ отзывы фестиваля (включая ещё не
// одобренные), не то же самое, что публичный список ниже.
export async function listFestivalReviews(festivalId: string, user: User): Promise<Review[]> {
  const festival = await prisma.festival.findUnique({ where: { id: festivalId } });
  if (!festival) throw new RegistrationNotFoundError();
  if (!(await hasFestivalAccess(festival, user))) throw new RegistrationForbiddenError("forbidden");

  return prisma.review.findMany({ where: { festivalId }, orderBy: { createdAt: "desc" } });
}

// Публичная — только одобренные, без RBAC (будущая публичная страница).
export async function listPublicFestivalReviews(festivalId: string): Promise<Review[]> {
  return prisma.review.findMany({
    where: { festivalId, moderationStatus: "APPROVED" },
    orderBy: { createdAt: "desc" },
  });
}
