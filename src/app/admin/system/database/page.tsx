import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { getDatabaseUsage, SUPABASE_FREE_PLAN_LIMITS, SUPABASE_USAGE_DASHBOARD_URL } from "@/lib/database-usage";
import { getVercelWebAnalytics, getLatestVercelDeployment, VERCEL_HOBBY_MONTHLY_EVENT_LIMIT } from "@/lib/vercel-analytics";
import { formatBytes, formatTimeAgo } from "@/lib/format";
import { t } from "@/lib/i18n/dictionary";
import { Card } from "@/components/ui/card";
import { UsageBar } from "@/components/admin/dashboard/UsageBar";
import { DailyVisitsChart } from "@/components/admin/dashboard/DailyVisitsChart";

// Статусы деплоя (readyState Vercel API) — enum самого Vercel, не наш; см.
// vercel.com/docs/rest-api/reference/endpoints/deployments/list-deployments.
const DEPLOYMENT_STATE_LABELS: Record<string, string> = {
  READY: "Готово",
  ERROR: "Ошибка",
  BUILDING: "Сборка",
  INITIALIZING: "Инициализация",
  QUEUED: "В очереди",
  CANCELED: "Отменён",
  BLOCKED: "Заблокирован",
};

// "База данных" (2026-09-12, по прямому запросу пользователя) — использование
// лимитов бесплатного плана Supabase. Только то, что реально измеримо через
// уже существующее подключение Prisma (pg_database_size + SQL по
// storage.objects, тот же метод, что Supabase сам документирует для расчёта
// Storage usage) — без новых секретов/токенов. Egress/MAU здесь сознательно
// НЕ выдуманы — см. тексты ниже и docs/00_DECISIONS.md.
export default async function DatabaseUsagePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isAdmin(user)) redirect("/admin");

  const [usage, analytics, deployment] = await Promise.all([
    getDatabaseUsage(),
    getVercelWebAnalytics(14),
    getLatestVercelDeployment(),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="m-0 font-night text-xl font-extrabold text-night-text sm:text-2xl">{t.databaseUsage.title}</h1>
        <p className="m-0 mt-1 text-sm text-admin-muted">{t.databaseUsage.subtitle}</p>
      </div>

      <Card className="flex flex-col gap-4 border-admin-border bg-admin-card">
        <UsageBar
          label={t.databaseUsage.dbSizeLabel}
          value={usage.databaseSizeBytes}
          limit={SUPABASE_FREE_PLAN_LIMITS.databaseSizeBytes}
          formatted={t.databaseUsage.usedOfLimit(formatBytes(usage.databaseSizeBytes), formatBytes(SUPABASE_FREE_PLAN_LIMITS.databaseSizeBytes))}
        />

        {usage.storageSizeBytes === null ? (
          <div className="flex flex-col gap-2">
            <p className="m-0 text-sm font-semibold text-night-text">{t.databaseUsage.storageSizeLabel}</p>
            <p className="m-0 text-sm text-admin-disabled">{t.databaseUsage.storageUnavailable}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <UsageBar
              label={t.databaseUsage.storageSizeLabel}
              value={usage.storageSizeBytes}
              limit={SUPABASE_FREE_PLAN_LIMITS.storageSizeBytes}
              formatted={t.databaseUsage.usedOfLimit(formatBytes(usage.storageSizeBytes), formatBytes(SUPABASE_FREE_PLAN_LIMITS.storageSizeBytes))}
            />
            {usage.storageBucketsCount === 0 && <p className="m-0 text-xs text-admin-disabled">{t.databaseUsage.storageUnused}</p>}
          </div>
        )}
      </Card>

      <Card className="flex flex-col gap-2 border-admin-border bg-admin-card">
        <p className="m-0 text-sm font-semibold text-night-text">{t.databaseUsage.egressTitle}</p>
        <p className="m-0 text-sm text-admin-muted">{t.databaseUsage.egressBody}</p>
        <a href={SUPABASE_USAGE_DASHBOARD_URL} target="_blank" rel="noreferrer" className="text-sm font-semibold text-admin-primaryHover no-underline hover:underline">
          {t.databaseUsage.egressLink}
        </a>
      </Card>

      <Card className="flex flex-col gap-2 border-admin-border bg-admin-card">
        <p className="m-0 text-sm font-semibold text-night-text">{t.databaseUsage.mauTitle}</p>
        <p className="m-0 text-sm text-admin-muted">{t.databaseUsage.mauBody}</p>
      </Card>

      <div>
        <h2 className="m-0 mb-2 font-night text-base font-bold text-night-text">{t.databaseUsage.vercelTitle}</h2>
      </div>

      {!analytics.configured ? (
        <Card className="border-admin-border bg-admin-card">
          <p className="m-0 text-sm text-admin-disabled">{t.databaseUsage.vercelNotConfigured}</p>
        </Card>
      ) : !analytics.ok ? (
        <Card className="border-admin-border bg-admin-card">
          <p className="m-0 text-sm text-red-400">
            {t.databaseUsage.vercelError}: {analytics.error}
          </p>
        </Card>
      ) : (
        <>
          <Card className="flex flex-col gap-3 border-admin-border bg-admin-card">
            <div>
              <p className="m-0 text-sm font-semibold text-night-text">{t.databaseUsage.visitsTitle}</p>
              <p className="m-0 text-xs text-admin-disabled">{t.databaseUsage.visitsHint}</p>
            </div>
            <DailyVisitsChart data={analytics.dailyVisits} />
          </Card>

          <Card className="flex flex-col gap-4 border-admin-border bg-admin-card">
            <UsageBar
              label={t.databaseUsage.monthEventsLabel}
              value={analytics.monthPageviews}
              limit={VERCEL_HOBBY_MONTHLY_EVENT_LIMIT}
              formatted={t.databaseUsage.usedOfLimit(String(analytics.monthPageviews), String(VERCEL_HOBBY_MONTHLY_EVENT_LIMIT))}
            />
            <p className="m-0 text-xs text-admin-disabled">{t.databaseUsage.egressNoteVercel}</p>
          </Card>
        </>
      )}

      {analytics.configured && (
        <Card className="flex flex-col gap-2 border-admin-border bg-admin-card">
          <p className="m-0 text-sm font-semibold text-night-text">{t.databaseUsage.deploymentTitle}</p>
          {!deployment.configured || !deployment.ok ? (
            <p className="m-0 text-sm text-admin-disabled">
              {deployment.configured && !deployment.ok ? `${t.databaseUsage.vercelError}: ${deployment.error}` : t.databaseUsage.vercelNotConfigured}
            </p>
          ) : deployment.deployment === null ? (
            <p className="m-0 text-sm text-admin-disabled">{t.databaseUsage.deploymentNone}</p>
          ) : (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="font-semibold text-night-text">{DEPLOYMENT_STATE_LABELS[deployment.deployment.state] ?? deployment.deployment.state}</span>
              <span className="text-admin-muted">{deployment.deployment.target ?? "preview"}</span>
              <span className="text-admin-muted">{formatTimeAgo(new Date(deployment.deployment.createdAt))}</span>
              {deployment.deployment.inspectorUrl && (
                <a
                  href={deployment.deployment.inspectorUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-admin-primaryHover no-underline hover:underline"
                >
                  {t.databaseUsage.deploymentOpenInVercel}
                </a>
              )}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
