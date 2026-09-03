import Link from "next/link";
import { t } from "@/lib/i18n/dictionary";
import { getCurrentUser, canCreateEvents, isModerator, isAdmin } from "@/lib/auth";
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
  // "Соревнования" — любому залогиненному, не только тем, у кого уже есть
  // роль в движке: иначе танцор, который никуда ещё не регистрировался, не
  // может даже узнать, что где-то открыта регистрация (/admin/competitions
  // сам показывает открытые для регистрации соревнования всем).
  const hasCompetitionAccess = !!user;

  return (
    <header className="sticky top-0 z-10 border-b border-line bg-white/90 backdrop-blur-md">
      <div className="container flex flex-wrap items-center justify-between gap-3 py-3">
        <Link
          href="/"
          className="bg-gradient-primary bg-clip-text font-display text-[1.15rem] font-extrabold tracking-tight text-transparent no-underline hover:no-underline"
        >
          {t.common.siteName}
        </Link>

        <CitySwitcher cities={cities} currentSlug={preferredCity?.slug ?? null} />

        <nav className="flex flex-wrap items-center gap-[18px] text-[0.95rem]">
          <Link href="/events" className="text-ink hover:text-primary hover:no-underline">
            {t.nav.calendar}
          </Link>
          <Link href="/schools" className="text-ink hover:text-primary hover:no-underline">
            {t.nav.schools}
          </Link>
          {canCreateEvents(user) && (
            <Link href="/events/new" className="text-ink hover:text-primary hover:no-underline">
              {t.nav.addEvent}
            </Link>
          )}
          {isModerator(user) && (
            <Link href="/moderation" className="text-ink hover:text-primary hover:no-underline">
              {t.nav.admin}
            </Link>
          )}
          {hasCompetitionAccess && (
            <Link href="/admin/competitions" className="text-ink hover:text-primary hover:no-underline">
              {t.nav.competitions}
            </Link>
          )}
          {isAdmin(user) && (
            <Link href="/admin/division-categories" className="text-ink hover:text-primary hover:no-underline">
              {t.nav.divisionCategories}
            </Link>
          )}
          {user ? (
            <>
              {dancer && (
                <Link href="/profile" className="text-ink hover:text-primary hover:no-underline">
                  {t.nav.profile}
                </Link>
              )}
              <form action="/api/auth/logout" method="post" className="inline">
                <button type="submit" className="cursor-pointer border-none bg-transparent p-0 font-body text-ink hover:text-primary">
                  {t.nav.logout}
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="text-ink hover:text-primary hover:no-underline">
                {t.nav.login}
              </Link>
              <Link href="/register" className="text-ink hover:text-primary hover:no-underline">
                {t.nav.register}
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
