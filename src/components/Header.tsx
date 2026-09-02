import Link from "next/link";
import { t } from "@/lib/i18n/dictionary";
import { getCurrentUser, canCreateEvents, isModerator } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPreferredCity } from "@/lib/city-preference";
import { CitySwitcher } from "./CitySwitcher";

export async function Header() {
  const user = await getCurrentUser();
  const [cities, preferredCity, dancer] = await Promise.all([
    prisma.city.findMany({ where: { isActive: true }, orderBy: { nameRu: "asc" } }),
    getPreferredCity(),
    // У служебных аккаунтов (админ/модератор) профиля танцора нет — ссылку
    // "Профиль" им не показываем, а не молча редиректим при клике.
    user ? prisma.dancer.findUnique({ where: { userId: user.id }, select: { id: true } }) : null,
  ]);

  return (
    <header className="site-header">
      <div className="container">
        <Link href="/" className="site-logo">
          {t.common.siteName}
        </Link>

        <CitySwitcher cities={cities} currentSlug={preferredCity?.slug ?? null} />

        <nav className="site-nav">
          <Link href="/events">{t.nav.calendar}</Link>
          <Link href="/schools">{t.nav.schools}</Link>
          {canCreateEvents(user) && <Link href="/events/new">{t.nav.addEvent}</Link>}
          {isModerator(user) && <Link href="/moderation">{t.nav.admin}</Link>}
          {user ? (
            <>
              {dancer && <Link href="/profile">{t.nav.profile}</Link>}
              <form action="/api/auth/logout" method="post" style={{ display: "inline" }}>
                <button type="submit" className="btn-secondary" style={{ border: "none", background: "none", cursor: "pointer", padding: 0, font: "inherit" }}>
                  {t.nav.logout}
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login">{t.nav.login}</Link>
              <Link href="/register">{t.nav.register}</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
