import { redirect } from "next/navigation";
import { getCurrentUser, isModerator } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { t } from "@/lib/i18n/dictionary";
import { ModerationActions } from "@/components/ModerationActions";

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

      <div style={{ display: "flex", gap: 8 }}>
        <a href="/moderation/reviews?tab=new" className={tab === "new" ? "btn btn-sm" : "btn btn-secondary btn-sm"}>
          {t.moderation.newReviewsTab}
        </a>
        <a href="/moderation/reviews?tab=all" className={tab === "all" ? "btn btn-sm" : "btn btn-secondary btn-sm"}>
          {t.moderation.allReviewsTab}
        </a>
      </div>

      {reviews.length === 0 ? (
        <p className="hint-text">
          {tab === "new" ? t.moderation.noNewReviews : t.moderation.noPendingEvents}
        </p>
      ) : (
        <div className="stack" style={{ gap: 12 }}>
          {reviews.map((r) => (
            <div key={r.id} className="card">
              <p className="stars" style={{ margin: 0 }}>
                {"★".repeat(r.rating)}
                {"☆".repeat(5 - r.rating)}
              </p>
              <p style={{ margin: "6px 0" }}>{r.text}</p>
              <p className="hint-text" style={{ margin: 0 }}>
                {r.school.name} · {r.author.email} · {t.moderation.reviewStatus}:{" "}
                {t.moderation.reviewStatusValues[r.moderationStatus]}
              </p>
              {tab === "all" && r.moderatedById && (
                <p className="hint-text" style={{ margin: 0 }}>
                  {t.moderation.reviewedNote}
                </p>
              )}
              <ModerationActions endpoint={`/api/moderation/reviews/${r.id}`} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
