import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listGuestQuestions } from "@/server/events/festival-guest-question-service";
import { listFestivalReviews } from "@/server/events/festival-review-service";
import { RegistrationForbiddenError, RegistrationNotFoundError } from "@/server/events/registration-service";
import { FestivalGuestQuestionModeration } from "@/components/admin/festival/FestivalGuestQuestionModeration";
import { FestivalReviewModeration } from "@/components/admin/festival/FestivalReviewModeration";

// Вкладка «Вопросы и отзывы» — Stage UI-3, продолжение Stage 3 сервисного
// слоя. Оба блока — очереди модерации ГОСТЕВОГО контента (не то, что
// организатор пишет сам, как FAQ) — организатор ЭТОГО фестиваля, не
// сайтовый модератор (прямое решение пользователя).
export default async function FestivalGuestsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  let questions, reviews;
  try {
    [questions, reviews] = await Promise.all([listGuestQuestions(id, user), listFestivalReviews(id, user)]);
  } catch (e) {
    if (e instanceof RegistrationForbiddenError) redirect("/admin/festival");
    if (e instanceof RegistrationNotFoundError) notFound();
    throw e;
  }

  return (
    <div className="flex flex-col gap-4">
      <FestivalGuestQuestionModeration
        festivalId={id}
        items={questions.map((q) => ({
          id: q.id,
          askerName: q.askerName,
          question: q.question,
          moderationStatus: q.moderationStatus,
          answer: q.answer,
        }))}
      />

      <FestivalReviewModeration
        festivalId={id}
        reviews={reviews.map((r) => ({
          id: r.id,
          rating: r.rating,
          text: r.text,
          moderationStatus: r.moderationStatus,
          authorLabel: r.author.dancer?.displayName ?? r.author.email,
          createdAt: r.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
