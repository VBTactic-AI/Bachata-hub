import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { t } from "@/lib/i18n/dictionary";
import { ModerationRowActions } from "@/components/admin/moderation/ModerationRowActions";
import { buttonVariants } from "@/components/ui/button";
import { StatusBadge } from "@/components/admin/StatusBadge";

// Перенесено из /moderation/reviews (2026-09-11), редизайн под admin-*. Две
// вкладки — "Новые" (moderatedById пуст) и "Все" (полная история) — та же
// логика, что и была, просто через ?tab= на новом пути.
export default async function ModerationReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isAdmin(user)) redirect("/admin");

  const sp = await searchParams;
  const tab = sp.tab === "all" ? "all" : "new";

  const reviews = await prisma.review.findMany({
    where: tab === "new" ? { moderatedById: null } : undefined,
    include: { school: true, author: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const statusVariant = { PENDING: "warning", APPROVED: "success", REJECTED: "danger" } as const;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="m-0 font-night text-xl font-extrabold text-night-text sm:text-2xl">{t.moderation.allReviews}</h1>
        <p className="m-0 mt-1 text-sm text-admin-muted">Отзывы публикуются только после проверки</p>
      </div>

      <div className="flex gap-2">
        <a
          href="/admin/moderation/reviews?tab=new"
          className={buttonVariants({ variant: tab === "new" ? "admin" : "adminOutline", size: "sm", className: "no-underline" })}
        >
          {t.moderation.newReviewsTab}
        </a>
        <a
          href="/admin/moderation/reviews?tab=all"
          className={buttonVariants({ variant: tab === "all" ? "admin" : "adminOutline", size: "sm", className: "no-underline" })}
        >
          {t.moderation.allReviewsTab}
        </a>
      </div>

      <div className="overflow-x-auto rounded-app border border-admin-border bg-admin-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-admin-card2 text-xs font-semibold uppercase tracking-wide text-admin-disabled">
            <tr>
              <th className="px-3 py-2.5 font-semibold">Отзыв</th>
              <th className="px-3 py-2.5 font-semibold">Школа · автор</th>
              <th className="px-3 py-2.5 font-semibold">Статус</th>
              <th className="px-3 py-2.5 text-right font-semibold">Действия</th>
            </tr>
          </thead>
          <tbody>
            {reviews.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-admin-muted">
                  {tab === "new" ? t.moderation.noNewReviews : t.moderation.noPendingEvents}
                </td>
              </tr>
            ) : (
              reviews.map((r) => (
                <tr key={r.id} className="border-t border-admin-border align-top">
                  <td className="px-3 py-2.5 max-w-[360px]">
                    <p className="m-0 tracking-wide text-admin-primaryHover">
                      {"★".repeat(r.rating)}
                      {"☆".repeat(5 - r.rating)}
                    </p>
                    <p className="m-0 mt-1 text-night-text">{r.text}</p>
                  </td>
                  <td className="px-3 py-2.5 text-admin-muted">
                    <p className="m-0 text-night-text">{r.school.name}</p>
                    <p className="m-0 text-xs text-admin-disabled">{r.author.email}</p>
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusBadge label={t.moderation.reviewStatusValues[r.moderationStatus]} variant={statusVariant[r.moderationStatus]} />
                    {tab === "all" && r.moderatedById && <p className="m-0 mt-1 text-xs text-admin-disabled">{t.moderation.reviewedNote}</p>}
                  </td>
                  <td className="px-3 py-2.5">
                    <ModerationRowActions endpoint={`/api/moderation/reviews/${r.id}`} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
