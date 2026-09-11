import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { getGrowthStats, getModerationQueueCounts } from "@/lib/moderation";
import { t } from "@/lib/i18n/dictionary";
import { cardVariants } from "@/components/ui/card";
import { StatCard } from "@/components/admin/StatCard";
import { cn } from "@/lib/cn";

// Обзор раздела "Модерация" (перенесён из /moderation, 2026-09-11) — та же
// очередь на проверку + метрики роста, что были на светлой домашней странице
// модерации, теперь как первый пункт группы "Модерация" в сайдбаре /admin.
export default async function ModerationOverviewPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isAdmin(user)) redirect("/admin");

  const [stats, queue] = await Promise.all([getGrowthStats(), getModerationQueueCounts()]);

  const queueCards = [
    { href: "/admin/moderation/events", label: t.moderation.events, value: queue.pendingEvents },
    { href: "/admin/moderation/schools", label: t.moderation.schoolClaims, value: queue.pendingClaims },
    { href: "/admin/moderation/reviews", label: t.moderation.reviews, value: queue.newReviews },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="m-0 font-night text-xl font-extrabold text-night-text sm:text-2xl">{t.moderation.queue}</h1>
        <p className="m-0 mt-1 text-sm text-admin-muted">Очередь на проверку и общие метрики платформы</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {queueCards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className={cn(cardVariants({ interactive: true }), "border-admin-border bg-admin-card hover:border-admin-primary/60")}
          >
            <p className="m-0 text-sm text-admin-muted">{c.label}</p>
            <p className="m-0 mt-1 text-2xl font-extrabold text-night-text">{c.value}</p>
          </Link>
        ))}
      </div>

      <div>
        <h2 className="m-0 mb-3 font-night text-base font-bold text-night-text">{t.moderation.stats}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard label={t.moderation.statsActiveCities} value={stats.activeCities} />
          <StatCard label={t.moderation.statsVerifiedSchools} value={stats.verifiedSchools} />
          <StatCard label={t.moderation.statsDancersWithHistory} value={stats.dancersWithHistory} />
        </div>
      </div>
    </div>
  );
}
