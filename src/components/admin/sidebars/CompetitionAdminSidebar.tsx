"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { t } from "@/lib/i18n/dictionary";
import { NavLink, SidebarFrame, TagIcon, StepsIcon, StarIcon, TrophyIcon, ChevronIcon, type NavItem } from "@/components/admin/nav-shared";

// Соревнования — доступна и рядовому организатору соревнований (свои,
// /admin/competitions уже фильтрует "все для SUPER_ADMIN / свои+открытые для
// остальных", см. src/app/admin/competitions/page.tsx), и супер-админу (видит
// все). Справочники (Категории/Этапы/Показатели) — по прямому решению
// пользователя видны ТОЛЬКО супер-админу здесь же, не в Мониторинге и не
// рядовому организатору (docs/00_DECISIONS.md, 2026-09-14) — isAdminUser
// передаётся явно, а не вычисляется внутри.
function referenceItems(): NavItem[] {
  return [
    { href: "/admin/division-categories", label: t.nav.divisionCategories, icon: <TagIcon />, match: (p) => p.startsWith("/admin/division-categories") },
    { href: "/admin/round-stages", label: t.nav.roundStages, icon: <StepsIcon />, match: (p) => p.startsWith("/admin/round-stages") },
    { href: "/admin/judging-criteria", label: t.nav.judgingCriteria, icon: <StarIcon />, match: (p) => p.startsWith("/admin/judging-criteria") },
  ];
}

export function CompetitionAdminSidebar({ isAdminUser }: { isAdminUser: boolean }) {
  const pathname = usePathname() ?? "";
  const referenceLinks = referenceItems();
  const referenceActive = referenceLinks.some((item) => item.match(pathname));
  const [referencesOpen, setReferencesOpen] = useState(referenceActive);

  const competitionsActive = pathname.startsWith("/admin/competitions");
  const competitionMatch = pathname.match(/^\/admin\/competitions\/([^/?#]+)/);
  const currentCompetitionId = competitionMatch && competitionMatch[1] !== "new" ? competitionMatch[1] : null;
  const [competitionsOpen, setCompetitionsOpen] = useState(competitionsActive);
  useEffect(() => {
    if (competitionsActive) setCompetitionsOpen(true);
  }, [competitionsActive]);

  return (
    <SidebarFrame>
      <div className="mt-0 flex shrink-0 items-center gap-1.5 sm:mt-0.5 sm:flex-col sm:items-stretch sm:gap-0.5">
        <div className="flex shrink-0 items-stretch gap-0.5 sm:w-full">
          <Link
            href="/admin/competitions"
            aria-current={competitionsActive ? "page" : undefined}
            title="Соревнования"
            className={`flex flex-1 items-center gap-2.5 whitespace-nowrap rounded-app-sm px-3 py-2 text-sm font-medium no-underline transition-colors hover:no-underline sm:min-w-0 sm:truncate ${
              competitionsActive
                ? "bg-admin-primary/15 text-night-text sm:relative sm:before:absolute sm:before:-left-3 sm:before:top-1/2 sm:before:block sm:before:h-5 sm:before:w-[3px] sm:before:-translate-y-1/2 sm:before:rounded-full sm:before:bg-admin-primary"
                : "text-admin-muted hover:bg-admin-card2 hover:text-night-text"
            }`}
          >
            <span className={`shrink-0 ${competitionsActive ? "text-admin-primary" : "text-admin-disabled"}`}>
              <TrophyIcon />
            </span>
            <span className="sm:truncate">Соревнования</span>
          </Link>
          {currentCompetitionId && (
            <button
              type="button"
              onClick={() => setCompetitionsOpen((v) => !v)}
              aria-expanded={competitionsOpen}
              aria-label={competitionsOpen ? "Свернуть текущее соревнование" : "Показать текущее соревнование"}
              className={`flex shrink-0 items-center justify-center rounded-app-sm px-2 transition-colors ${
                competitionsActive ? "text-admin-primary hover:bg-admin-card2" : "text-admin-disabled hover:bg-admin-card2 hover:text-night-text"
              }`}
            >
              <ChevronIcon open={competitionsOpen} />
            </button>
          )}
        </div>
        {currentCompetitionId && (
          <div
            className={`grid shrink-0 transition-[grid-template-rows] duration-300 ease-out sm:w-full ${
              competitionsOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
            }`}
          >
            <div className="min-h-0 overflow-hidden">
              <div className="flex shrink-0 flex-col gap-0.5 pt-0.5 sm:pl-1">
                <NavLink
                  item={{
                    href: `/admin/competitions/${currentCompetitionId}`,
                    label: "Текущее соревнование",
                    icon: <TrophyIcon />,
                    match: (p) => p.startsWith(`/admin/competitions/${currentCompetitionId}`),
                  }}
                  active
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {isAdminUser && (
        <div className="mt-0 flex shrink-0 items-center gap-1.5 sm:mt-5 sm:flex-col sm:items-stretch sm:gap-0.5">
          <button
            type="button"
            onClick={() => setReferencesOpen((v) => !v)}
            aria-expanded={referencesOpen}
            className={`flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-app-sm px-3 py-2 text-sm font-medium transition-colors sm:w-full ${
              referenceActive ? "text-night-text" : "text-admin-muted hover:bg-admin-card2 hover:text-night-text"
            }`}
          >
            <span className={referenceActive ? "text-admin-primary" : "text-admin-disabled"}>
              <StarIcon />
            </span>
            <span className="flex-1 text-left">{t.nav.references}</span>
            <span className={referenceActive ? "text-admin-primary" : "text-admin-disabled"}>
              <ChevronIcon open={referencesOpen} />
            </span>
          </button>
          <div
            className={`grid shrink-0 transition-[grid-template-rows] duration-300 ease-out sm:w-full ${
              referencesOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
            }`}
          >
            <div className="min-h-0 overflow-hidden">
              <div className="flex shrink-0 flex-col gap-0.5 pt-0.5 sm:pl-1">
                {referenceLinks.map((item) => (
                  <NavLink key={item.href} item={item} active={item.match(pathname)} />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </SidebarFrame>
  );
}
