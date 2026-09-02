import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin, isModerator } from "@/lib/auth";
import { getGrowthStats, getModerationQueueCounts } from "@/lib/moderation";
import { t } from "@/lib/i18n/dictionary";

export default async function ModerationHomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isModerator(user)) redirect("/");

  const [stats, queue] = await Promise.all([getGrowthStats(), getModerationQueueCounts()]);

  return (
    <div className="stack">
      <h1 className="page-title">{t.moderation.queue}</h1>

      <div className="card-grid">
        <Link href="/moderation/events" className="card">
          <strong>{t.moderation.events}</strong>
          <p className="hint-text" style={{ margin: "4px 0 0" }}>
            {queue.pendingEvents}
          </p>
        </Link>
        <Link href="/moderation/schools" className="card">
          <strong>{t.moderation.schoolClaims}</strong>
          <p className="hint-text" style={{ margin: "4px 0 0" }}>
            {queue.pendingClaims}
          </p>
        </Link>
        <Link href="/moderation/reviews" className="card">
          <strong>{t.moderation.reviews}</strong>
          <p className="hint-text" style={{ margin: "4px 0 0" }}>
            {queue.newReviews}
          </p>
        </Link>
        <Link href="/moderation/log" className="card">
          <strong>{t.moderation.log}</strong>
        </Link>
        {isAdmin(user) && (
          <Link href="/moderation/users" className="card">
            <strong>{t.moderation.users}</strong>
          </Link>
        )}
      </div>

      <div>
        <h2 className="page-title">{t.moderation.stats}</h2>
        <div className="card-grid">
          <div className="card">
            <p style={{ fontSize: "1.6rem", margin: 0, fontWeight: 700 }}>{stats.activeCities}</p>
            <p className="hint-text" style={{ margin: 0 }}>
              {t.moderation.statsActiveCities}
            </p>
          </div>
          <div className="card">
            <p style={{ fontSize: "1.6rem", margin: 0, fontWeight: 700 }}>{stats.verifiedSchools}</p>
            <p className="hint-text" style={{ margin: 0 }}>
              {t.moderation.statsVerifiedSchools}
            </p>
          </div>
          <div className="card">
            <p style={{ fontSize: "1.6rem", margin: 0, fontWeight: 700 }}>{stats.dancersWithHistory}</p>
            <p className="hint-text" style={{ margin: 0 }}>
              {t.moderation.statsDancersWithHistory}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
