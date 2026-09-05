import Link from "next/link";
import { t } from "@/lib/i18n/dictionary";

const LINKS = [
  { href: "/admin", label: t.nav.dashboard, adminOnly: false },
  { href: "/admin/competitions", label: t.nav.manageCompetitions, adminOnly: false },
  { href: "/admin/division-categories", label: t.nav.divisionCategories, adminOnly: true },
  { href: "/admin/round-stages", label: t.nav.roundStages, adminOnly: true },
];

// Общая навигация /admin/** (CLAUDE.md §41 — Admin Interface) — раньше эти
// разделы были разбросаны отдельными страницами без единого входа
// ("Панель управления" нигде не было, найдено пользователем 07.09.2026).
// Desktop — боковая колонка; на мобильном админка вторична (по решению
// пользователя, 06.09.2026 — админка "больше ориентирована на десктоп"),
// поэтому на мобильном те же ссылки идут горизонтальной прокруткой сверху,
// а не бургер-меню.
export function AdminSidebar({ isAdminUser }: { isAdminUser: boolean }) {
  const links = LINKS.filter((l) => !l.adminOnly || isAdminUser);

  return (
    <nav
      className="flex gap-1.5 overflow-x-auto border-b border-line pb-3 sm:w-[220px] sm:shrink-0 sm:flex-col sm:overflow-visible sm:border-b-0 sm:border-r sm:pb-0 sm:pr-4"
      aria-label="Разделы админки"
    >
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className="shrink-0 whitespace-nowrap rounded-app-sm px-3 py-2 text-sm font-medium text-ink no-underline hover:bg-primary-light hover:text-primary hover:no-underline"
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
