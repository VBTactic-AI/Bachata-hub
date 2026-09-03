import { redirect } from "next/navigation";
import { getCurrentUser, isModerator } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { t } from "@/lib/i18n/dictionary";
import { ModerationActions } from "@/components/ModerationActions";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

// Отзывы теперь публикуются только после проверки (moderationStatus:
// PENDING по умолчанию — автору при этом отзыв виден сразу, см. страницу
// школы). Две вкладки: "Новые" — те, на которые ещё ни один модератор не
// отреагировал (moderatedById пуст, на практике почти всегда PENDING), и
// "Все" — полная история для контекста. После одобрения/отклонения отзыв
// получает moderatedById и пропадает из "Новых".
export default async function ModerationReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isModerator(user)) redirect("/");

  const sp = await searchParams;
  const tab = sp.tab === "all" ? "all" : "new";

  const reviews = await prisma.review.findMany({
    where: tab === "new" ? { moderatedById: null } : undefined,
    include: { school: true, author: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div className="stack">
      <h1 className="page-title">{t.moderation.allReviews}</h1>

      <div className="flex gap-2">
        <a
          href="/moderation/reviews?tab=new"
          className={buttonVariants({ variant: tab === "new" ? "default" : "secondary", size: "sm", className: "no-underline" })}
        >
          {t.moderation.newReviewsTab}
        </a>
        <a
          href="/moderation/reviews?tab=all"
          className={buttonVariants({ variant: tab === "all" ? "default" : "secondary", size: "sm", className: "no-underline" })}
        >
          {t.moderation.allReviewsTab}
        </a>
      </div>

      {reviews.length === 0 ? (
        <p className="hint-text">
          {tab === "new" ? t.moderation.noNewReviews : t.moderation.noPendingEvents}
        </p>
      ) : (
        <div className="stack gap-3">
          {reviews.map((r) => (
            <Card key={r.id}>
              <p className="m-0 tracking-wide text-accent">
                {"★".repeat(r.rating)}
                {"☆".repeat(5 - r.rating)}
              </p>
              <p className="my-1.5">{r.text}</p>
              <p className="hint-text m-0">
                {r.school.name} · {r.author.email} · {t.moderation.reviewStatus}:{" "}
                {t.moderation.reviewStatusValues[r.moderationStatus]}
              </p>
              {tab === "all" && r.moderatedById && (
                <p className="hint-text m-0">{t.moderation.reviewedNote}</p>
              )}
              <ModerationActions endpoint={`/api/moderation/reviews/${r.id}`} />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
