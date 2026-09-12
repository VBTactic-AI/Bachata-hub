import Link from "next/link";
import type { SchoolActivity } from "@/lib/admin-dashboard";
import { t } from "@/lib/i18n/dictionary";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { pluralizeRu } from "@/lib/format";

export function TopSchoolsPanel({ schools }: { schools: SchoolActivity[] }) {
  if (schools.length === 0) {
    return <p className="m-0 text-sm text-admin-muted">{t.adminDashboard.topSchoolsEmpty}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {schools.map((school) => (
        <Link
          key={school.id}
          href={`/schools/${school.slug}`}
          className="flex flex-col gap-1.5 rounded-app-sm border border-admin-border bg-admin-card2 p-3 no-underline transition-colors hover:border-admin-primary/60 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex min-w-0 flex-col gap-1">
            <span className="truncate text-sm font-semibold text-night-text">{school.name}</span>
            <span className="text-xs text-admin-muted">{school.cityName}</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge
              label={school.isActive ? t.adminDashboard.schoolActive : t.adminDashboard.schoolHidden}
              variant={school.isActive ? "success" : "neutral"}
            />
            <StatusBadge
              label={school.verificationStatus === "VERIFIED" ? t.adminDashboard.schoolVerified : t.adminDashboard.schoolCommunity}
              variant={school.verificationStatus === "VERIFIED" ? "success" : "neutral"}
            />
            <span className="whitespace-nowrap text-xs font-semibold text-admin-primaryHover">
              {school.upcomingEventsCount} {pluralizeRu(school.upcomingEventsCount, ["событие", "события", "событий"])}{" "}
              {t.adminDashboard.upcomingEventsCount}
            </span>
            {school.pendingEventsCount > 0 && (
              <StatusBadge label={`${school.pendingEventsCount} ${t.adminDashboard.pendingModerationCount}`} variant="warning" />
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}
