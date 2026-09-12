import type { SystemHealth } from "@/lib/admin-dashboard";
import { t } from "@/lib/i18n/dictionary";
import { formatBytes } from "@/lib/format";
import { DatabaseIcon, ActivityIcon } from "@/components/admin/icons";

// "Состояние базы" — только реально измеримые вещи (см. комментарий в
// lib/admin-dashboard.ts про то, чего здесь сознательно нет).
export function SystemHealthCard({ health }: { health: SystemHealth }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-admin-primary/15 text-admin-primaryHover">
          <DatabaseIcon />
        </span>
        <div>
          <p className="m-0 text-sm text-admin-muted">{t.adminDashboard.dbSize}</p>
          <p className="m-0 text-xl font-extrabold text-night-text">{formatBytes(health.dbSizeBytes)}</p>
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-admin-border pt-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-night-text">
          <ActivityIcon />
          {t.adminDashboard.activity24h}
        </div>
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-sm text-admin-muted">
          <li className="flex items-center justify-between">
            <span>{t.adminDashboard.newUsers24h}</span>
            <span className="font-semibold text-night-text">{health.newUsers24h}</span>
          </li>
          <li className="flex items-center justify-between">
            <span>{t.adminDashboard.newEvents24h}</span>
            <span className="font-semibold text-night-text">{health.newEvents24h}</span>
          </li>
          <li className="flex items-center justify-between">
            <span>{t.adminDashboard.auditEntries24h}</span>
            <span className="font-semibold text-night-text">{health.auditLogCount24h}</span>
          </li>
        </ul>
      </div>

      <p className="m-0 text-[0.7rem] leading-relaxed text-admin-disabled">{t.adminDashboard.analyticsNote}</p>
    </div>
  );
}
