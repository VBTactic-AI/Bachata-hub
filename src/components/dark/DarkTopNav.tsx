import Link from "next/link";
import { t } from "@/lib/i18n/dictionary";
import { getCurrentUser } from "@/lib/auth";
import { getMyDancerRef } from "@/lib/dancer";
import { getPreferredCity } from "@/lib/city-preference";
import { getActiveCities } from "@/lib/cities";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { CityHeaderPicker } from "@/components/dark/CityHeaderPicker";

const NAV_LINK = "text-night-muted no-underline hover:text-night-text hover:no-underline";

// Десктопная навигация тёмного "night"-раздела (/compete, /schools) — по
// макету JBJ Platform (design/project/JBJ Platform.dc.html, экран "isWeb"),
// перекомпонована по референсу пользователя (2026-09-13): лого слева, пункты
// меню по центру шапки, справа — город/уведомления/аккаунт, во всю ширину.
// Заменяет светлый сайтовый Header в этих разделах (см. HeaderVisibility) —
// видна только от sm: и выше, на мобильном её место занимает BottomNav.
//
// "Панель управления" (была видна только организаторам/админам) заменена
// постоянным пунктом "Для организаторов" → /admin — сама страница уже
// делает redirect на /login неавторизованным (src/app/admin/page.tsx), так
// что показывать ссылку всем безопасно и не требует повторной RBAC-проверки
// здесь. "Модерация" и "Добавить событие" по-прежнему не дублируются в общей
// навигации (2026-09-11) — обе живут внутри /admin.
export async function DarkTopNav() {
  const [user, dancer, preferredCity, cities] = await Promise.all([
    getCurrentUser(),
    getMyDancerRef(),
    getPreferredCity(),
    getActiveCities(),
  ]);

  return (
    <header
      className="sticky top-0 z-20 hidden items-center gap-3 border-b border-night-border bg-night-bg/95 px-4 py-3.5 backdrop-blur-md sm:grid lg:gap-6 lg:px-8 lg:py-4"
      style={{ gridTemplateColumns: "auto 1fr auto" }}
    >
      <Link
        href="/"
        className="justify-self-start whitespace-nowrap font-night text-base font-bold tracking-tight text-night-primary no-underline hover:no-underline lg:text-lg"
      >
        {t.common.siteName}
      </Link>
      <nav className="flex flex-wrap items-center justify-center gap-3 font-night text-[0.8rem] font-medium lg:gap-6 lg:text-sm">
        <Link href="/" className={NAV_LINK}>
          {t.nav.home}
        </Link>
        <Link href="/events" className={NAV_LINK}>
          {t.nav.events}
        </Link>
        <Link href="/compete" className={NAV_LINK}>
          {t.nav.competitions}
        </Link>
        <Link href="/schools" className={NAV_LINK}>
          {t.nav.schools}
        </Link>
        <Link href="/rating" className={NAV_LINK}>
          {t.nav.rating}
        </Link>
        <Link href="/admin" className={`${NAV_LINK} whitespace-nowrap`}>
          {t.nav.forOrganizers}
        </Link>
      </nav>
      <div className="flex items-center justify-self-end gap-2 font-night text-sm lg:gap-3">
        <CityHeaderPicker cities={cities} currentName={preferredCity?.nameRu ?? null} />
        {user ? (
          <>
            <NotificationBell />
            {dancer && (
              <Link
                href="/profile"
                className="whitespace-nowrap rounded-full border border-night-border px-4 py-2 font-medium text-night-text no-underline hover:border-night-primary hover:text-night-text hover:no-underline lg:px-5 lg:py-2.5"
              >
                {t.nav.profile}
              </Link>
            )}
            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                className="cursor-pointer whitespace-nowrap rounded-full border-none bg-gradient-night-cta px-4 py-2 font-night font-bold text-white lg:px-5 lg:py-2.5"
              >
                {t.nav.logout}
              </button>
            </form>
          </>
        ) : (
          <>
            <Link
              href="/login"
              className="whitespace-nowrap rounded-full border border-night-border px-4 py-2 font-medium text-night-text no-underline hover:border-night-primary hover:text-night-text hover:no-underline lg:px-5 lg:py-2.5"
            >
              {t.nav.login}
            </Link>
            <Link
              href="/register"
              className="whitespace-nowrap rounded-full bg-gradient-night-cta px-4 py-2 font-bold text-white no-underline hover:no-underline lg:px-5 lg:py-2.5"
            >
              {t.nav.register}
            </Link>
          </>
        )}
      </div>
    </header>
  );
}
