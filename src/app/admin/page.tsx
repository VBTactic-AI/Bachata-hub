import Link from "next/link";
import { redirect } from "next/navigation";
import { getActor } from "@/server/rbac/actor";
import { isJudgeOnlyActor } from "@/server/rbac/authorize";
import { isAdmin, getCurrentUser } from "@/lib/auth";
import { getModerationQueueCounts } from "@/lib/moderation";
import {
  getGlobalOverview,
  getCityActivityNetwork,
  getTopActiveSchools,
  getRecentEventsFeed,
  getSystemHealth,
} from "@/lib/admin-dashboard";
import { getDatabaseUsage, SUPABASE_FREE_PLAN_LIMITS } from "@/lib/database-usage";
import { DatabaseIcon } from "@/components/admin/icons";
import { t } from "@/lib/i18n/dictionary";
import { formatBytes } from "@/lib/format";
import { StatCard } from "@/components/admin/StatCard";
import { Card, cardVariants } from "@/components/ui/card";
import type { GlobalOverview, CityActivity, SchoolActivity, FeedEvent, SystemHealth } from "@/lib/admin-dashboard";
import { ActivityNetworkGraph } from "@/components/admin/dashboard/ActivityNetworkGraph";
import { TopSchoolsPanel } from "@/components/admin/dashboard/TopSchoolsPanel";
import { LiveEventsFeed } from "@/components/admin/dashboard/LiveEventsFeed";
import { SystemHealthCard } from "@/components/admin/dashboard/SystemHealthCard";
import { BuildingIcon, PeopleIcon, TrophyIcon, GridIcon, ShieldIcon } from "@/components/admin/icons";
import { cn } from "@/lib/cn";

// Панель управления /admin — раньше в разделе не было общего "входа": сразу
// список соревнований без сводки (найдено пользователем 07.09.2026). Та же
// область видимости, что и в /admin/competitions (isSuperAdmin — все
// соревнования, иначе только свои + открытые для регистрации), чтобы цифры
// на панели не показывали то, что человек не может открыть по ссылке рядом.
export default async function AdminDashboardPage() {
  const actor = await getActor();
  if (!actor) redirect("/login");
  // Судья — только судья, без каких-либо других ролей — не должен видеть
  // "Панель управления" вообще (CLAUDE.md §40/§52, жалоба пользователя,
  // 2026-09-10): у него нет ни одной причины сюда заходить, его место —
  // прямая ссылка на /judging/[competitionId], которую даёт организатор.
  if (isJudgeOnlyActor(actor)) redirect("/");
  const user = await getCurrentUser();

  // Общесистемная сводка — только для ADMIN (та же граница видимости, что и у
  // "Справочники"/"Модерация" в AdminSidebar, и у /admin/moderation целиком):
  // EVENT_ADMIN/HEAD_JUDGE/SCORER/DJ/MC не управляют школами/пользователями
  // сайта и не должны платить лишними запросами к БД за экран, которым не
  // пользуются (в духе A30 — не грузить то, что не нужно на каждой загрузке).
  const showGlobalDashboard = isAdmin(user);

  let globalOverview: GlobalOverview | null = null;
  let cityActivity: CityActivity[] = [];
  let topSchools: SchoolActivity[] = [];
  let recentFeed: FeedEvent[] = [];
  let systemHealth: SystemHealth | null = null;
  let moderationQueue: { pendingEvents: number; pendingClaims: number; newReviews: number } | null = null;
  let dbUsagePercent: number | null = null;
  let dbSizeBytes: number | null = null;

  if (showGlobalDashboard) {
    let databaseUsage: Awaited<ReturnType<typeof getDatabaseUsage>>;
    [globalOverview, cityActivity, topSchools, recentFeed, systemHealth, moderationQueue, databaseUsage] = await Promise.all([
      getGlobalOverview(),
      getCityActivityNetwork(),
      getTopActiveSchools(6),
      getRecentEventsFeed(12),
      getSystemHealth(),
      getModerationQueueCounts(),
      getDatabaseUsage(),
    ]);
    dbSizeBytes = databaseUsage.databaseSizeBytes;
    dbUsagePercent = Math.min(100, Math.round((databaseUsage.databaseSizeBytes / SUPABASE_FREE_PLAN_LIMITS.databaseSizeBytes) * 100));
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="m-0 font-night text-xl font-extrabold text-night-text sm:text-3xl">Панель управления</h1>

      {showGlobalDashboard && globalOverview && systemHealth && moderationQueue && (
        <>
          <div>
            <h2 className="m-0 mb-3 font-night text-base font-bold text-night-text">{t.adminDashboard.sectionTitle}</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label={t.adminDashboard.totalSchools} value={globalOverview.totalSchools} icon={<BuildingIcon />} />
              <StatCard label={t.adminDashboard.totalUsers} value={globalOverview.totalUsers} icon={<PeopleIcon />} />
              <StatCard label={t.adminDashboard.totalCompetitions} value={globalOverview.totalCompetitions} icon={<TrophyIcon />} />
              <StatCard label={t.adminDashboard.totalEvents} value={globalOverview.totalEvents} icon={<GridIcon />} />
            </div>
            <p className="m-0 mt-2 text-xs text-admin-muted">
              {globalOverview.verifiedSchools} {t.adminDashboard.verifiedSchoolsHint}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="flex flex-col gap-4 lg:col-span-2">
              <Card className="border-admin-border bg-admin-card">
                <h2 className="m-0 mb-1 font-night text-base font-bold text-night-text">{t.adminDashboard.activityNetwork}</h2>
                <p className="m-0 mb-3 text-xs text-admin-muted">{t.adminDashboard.activityNetworkHint}</p>
                <ActivityNetworkGraph cities={cityActivity} />
              </Card>

              <Card className="border-admin-border bg-admin-card">
                <h2 className="m-0 mb-1 font-night text-base font-bold text-night-text">{t.adminDashboard.topSchools}</h2>
                <p className="m-0 mb-3 text-xs text-admin-muted">{t.adminDashboard.topSchoolsHint}</p>
                <TopSchoolsPanel schools={topSchools} />
              </Card>
            </div>

            <div className="flex flex-col gap-4">
              <Link
                href="/admin/moderation"
                className={cn(
                  cardVariants({ interactive: true }),
                  "block border-admin-border bg-admin-card no-underline hover:border-admin-primary/60"
                )}
              >
                <div className="mb-3 flex items-center gap-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-night-warning/15 text-night-warning">
                    <ShieldIcon />
                  </span>
                  <div>
                    <p className="m-0 text-sm text-admin-muted">{t.adminDashboard.moderationCardTitle}</p>
                    <p className="m-0 text-xl font-extrabold text-night-text">
                      {moderationQueue.pendingEvents + moderationQueue.pendingClaims + moderationQueue.newReviews}{" "}
                      {t.adminDashboard.moderationCardHint}
                    </p>
                  </div>
                </div>
                <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-sm text-admin-muted">
                  <li className="flex items-center justify-between">
                    <span>{t.moderation.events}</span>
                    <span className="font-semibold text-night-text">{moderationQueue.pendingEvents}</span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span>{t.moderation.schoolClaims}</span>
                    <span className="font-semibold text-night-text">{moderationQueue.pendingClaims}</span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span>{t.moderation.reviews}</span>
                    <span className="font-semibold text-night-text">{moderationQueue.newReviews}</span>
                  </li>
                </ul>
              </Link>

              {dbUsagePercent !== null && dbSizeBytes !== null && (
                <StatCard
                  label={t.databaseUsage.dashboardCardLabel}
                  value={formatBytes(dbSizeBytes)}
                  icon={<DatabaseIcon />}
                  tone={dbUsagePercent >= 90 ? "danger" : "primary"}
                  percent={dbUsagePercent}
                  href="/admin/database"
                />
              )}

              <Card className="border-admin-border bg-admin-card">
                <LiveEventsFeed initialEvents={recentFeed} />
              </Card>

              <Card className="border-admin-border bg-admin-card">
                <SystemHealthCard health={systemHealth} />
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
