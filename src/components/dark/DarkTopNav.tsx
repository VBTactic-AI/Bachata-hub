import Link from "next/link";
import { t } from "@/lib/i18n/dictionary";
import { getCurrentUser, canCreateEvents, isModerator } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const NAV_LINK = "text-night-muted no-underline hover:text-night-text hover:no-underline";

// Десктопная навигация тёмного "night"-раздела (/compete, /schools) — по
// макету JBJ Platform (design/project/JBJ Platform.dc.html, экран "isWeb").
// Заменяет светлый сайтовый Header в этих разделах (см. HeaderVisibility) —
// видна только от sm: и выше, на мобильном её место занимает BottomNav.
//
// Ссылки на /admin/**, /moderation и /events/new раньше были только в
// светлом Header — когда его скрыли на этих маршрутах (07.09.2026), доступ
// к админке и модерации пропал из интерфейса целиком (найдено пользователем).
// Права те же, что и в Header.tsx: hasCompetitionAccess/isModerator/isAdmin/
// canCreateEvents, не выдумываем новые.
export async function DarkTopNav() {
  const user = await getCurrentUser();
  const dancer = user
    ? await prisma.dancer.findUnique({ where: { userId: user.id }, select: { id: true } })
    : null;
  // "Соревнования" (управление) — любому залогиненному, не только тем, у
  // кого уже есть роль в движке (тот же комментарий, что и в Header.tsx).
  const hasCompetitionAccess = !!user;

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
        {canCreateEvents(user) && (
          <Link href="/events/new" className={NAV_LINK}>
            {t.nav.addEvent}
          </Link>
        )}
        {isModerator(user) && (
          <Link href="/moderation" className={NAV_LINK}>
            {t.nav.admin}
          </Link>
        )}
        {hasCompetitionAccess && (
          <Link href="/admin" className={NAV_LINK}>
            {t.nav.dashboard}
          </Link>
        )}
      </nav>
      {user ? (
        <div className="flex items-center gap-3 font-night text-sm">
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
