import Link from "next/link";
import { t } from "@/lib/i18n/dictionary";
import { getCurrentUser } from "@/lib/auth";
import { getMyDancerRef } from "@/lib/dancer";
import { getActor } from "@/server/rbac/actor";
import { hasNoAdminAccess } from "@/server/rbac/authorize";
import { NotificationBell } from "@/components/notifications/NotificationBell";

const NAV_LINK = "text-night-muted no-underline hover:text-night-text hover:no-underline";

// Десктопная навигация тёмного "night"-раздела (/compete, /schools) — по
// макету JBJ Platform (design/project/JBJ Platform.dc.html, экран "isWeb").
// Заменяет светлый сайтовый Header в этих разделах (см. HeaderVisibility) —
// видна только от sm: и выше, на мобильном её место занимает BottomNav.
//
// "Модерация" и "Добавить событие" убраны отсюда (2026-09-11, по прямому
// запросу пользователя) — обе живут внутри /admin (сайдбар, разделы
// "Модерация" и "Контент"), дублировать их в общесайтовой навигации больше
// не нужно.
export async function DarkTopNav() {
  const user = await getCurrentUser();
  const dancer = await getMyDancerRef();
  const actor = await getActor();
  // Ни судья, ни рядовой участник (и уж тем более незалогиненный/без единой
  // роли пользователь) не должны видеть ссылку на "Панель управления" —
  // раньше кнопка показывалась любому залогиненному и вела на страницу,
  // которая либо тут же редиректила судью обратно, либо (для рядового
  // участника) открывала почти пустую страницу без единой секции (жалоба
  // пользователя, 2026-09-10 и 2026-09-13). См. hasNoAdminAccess —
  // единственная причина показать ссылку: у актёра есть хоть какое-то
  // реальное административное/организаторское право.
  const hasCompetitionAccess = !!actor && !hasNoAdminAccess(actor);

  return (
    <header className="sticky top-0 z-20 hidden items-center gap-6 border-b border-night-border bg-night-bg/95 px-8 py-4 backdrop-blur-md sm:flex">
      <Link href="/" className="font-night text-lg font-bold tracking-tight text-night-primary no-underline hover:no-underline">
        {t.common.siteName}
      </Link>
      <nav className="flex flex-1 flex-wrap items-center gap-6 font-night text-sm font-medium">
        <Link href="/events" className={NAV_LINK}>
          {t.nav.calendar}
        </Link>
        <Link href="/compete" className={NAV_LINK}>
          {t.nav.competitions}
        </Link>
        <Link href="/schools" className={NAV_LINK}>
          {t.nav.schools}
        </Link>
        {hasCompetitionAccess && (
          <Link href="/admin" className={NAV_LINK}>
            {t.nav.dashboard}
          </Link>
        )}
      </nav>
      {user ? (
        <div className="flex items-center gap-3 font-night text-sm">
          <NotificationBell />
          {dancer && (
            <Link
              href="/profile"
              className="rounded-full border border-night-border px-5 py-2.5 font-medium text-night-text no-underline hover:border-night-primary hover:text-night-text hover:no-underline"
            >
              {t.nav.profile}
            </Link>
          )}
          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              className="cursor-pointer rounded-full border-none bg-gradient-night-cta px-5 py-2.5 font-night font-bold text-white"
            >
              {t.nav.logout}
            </button>
          </form>
        </div>
      ) : (
        <div className="flex items-center gap-3 font-night text-sm">
          <Link
            href="/login"
            className="rounded-full border border-night-border px-5 py-2.5 font-medium text-night-text no-underline hover:border-night-primary hover:text-night-text hover:no-underline"
          >
            {t.nav.login}
          </Link>
          <Link href="/register" className="rounded-full bg-gradient-night-cta px-5 py-2.5 font-bold text-white no-underline hover:no-underline">
            {t.nav.register}
          </Link>
        </div>
      )}
    </header>
  );
}
