import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin, isModerator } from "@/lib/auth";
import { getGrowthStats, getModerationQueueCounts } from "@/lib/moderation";
import { t } from "@/lib/i18n/dictionary";
import { cardVariants, Card } from "@/components/ui/card";

export default async function ModerationHomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isModerator(user)) redirect("/");

  const [stats, queue] = await Promise.all([getGrowthStats(), getModerationQueueCounts()]);

  return (
    <div className="stack">
      <h1 className="page-title">{t.moderation.queue}</h1>

      <div className="card-grid">
        <Link href="/moderation/events" className={cardVariants({ interactive: true })}>
          <strong>{t.moderation.events}</strong>
          <p className="hint-text mt-1">{queue.pendingEvents}</p>
        </Link>
        <Link href="/moderation/schools" className={cardVariants({ interactive: true })}>
          <strong>{t.moderation.schoolClaims}</strong>
          <p className="hint-text mt-1">{queue.pendingClaims}</p>
        </Link>
        <Link href="/moderation/reviews" className={cardVariants({ interactive: true })}>
          <strong>{t.moderation.reviews}</strong>
          <p className="hint-text mt-1">{queue.newReviews}</p>
        </Link>
        <Link href="/moderation/log" className={cardVariants({ interactive: true })}>
          <strong>{t.moderation.log}</strong>
        </Link>
        {isAdmin(user) && (
          <Link href="/moderation/users" className={cardVariants({ interactive: true })}>
            <strong>{t.moderation.users}</strong>
          </Link>
        )}
      </div>

      <div>
        <h2 className="page-title">{t.moderation.stats}</h2>
        <div className="card-grid">
          <Card>
            <p className="m-0 text-[1.6rem] font-bold">{stats.activeCities}</p>
            <p className="hint-text m-0">{t.moderation.statsActiveCities}</p>
          </Card>
          <Card>
            <p className="m-0 text-[1.6rem] font-bold">{stats.verifiedSchools}</p>
            <p className="hint-text m-0">{t.moderation.statsVerifiedSchools}</p>
          </Card>
          <Card>
            <p className="m-0 text-[1.6rem] font-bold">{stats.dancersWithHistory}</p>
            <p className="hint-text m-0">{t.moderation.statsDancersWithHistory}</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
