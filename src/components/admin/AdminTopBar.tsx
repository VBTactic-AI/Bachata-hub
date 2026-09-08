import Link from "next/link";
import { t } from "@/lib/i18n/dictionary";
import { getCurrentUser, isModerator } from "@/lib/auth";
import { getMyDancerRef } from "@/lib/dancer";

// Компактная шапка /admin — заменяет общесайтовый DarkTopNav именно в этом
// разделе (redesign, 2026-09-08): референс не показывает публичную навигацию
// сайта (Календарь/Соревнования/Школы) внутри админки, только выход и
// сервисные ссылки. Действия те же, что и были у DarkTopNav на /admin —
// ничего не убрано, просто вынесено в свою, более компактную шапку.
export async function AdminTopBar() {
  const user = await getCurrentUser();
  const dancer = await getMyDancerRef();

  return (
    <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b border-night-border bg-night-bg/95 px-4 py-3 backdrop-blur-md sm:px-6">
      <Link
        href="/"
        className="font-night text-sm font-medium text-night-muted no-underline hover:text-night-text hover:no-underline"
      >
        ← На сайт
      </Link>
      {user ? (
        <div className="flex flex-wrap items-center gap-3 font-night text-sm sm:gap-4">
          {isModerator(user) && (
            <Link href="/moderation" className="text-night-muted no-underline hover:text-night-text hover:no-underline">
              {t.nav.admin}
            </Link>
          )}
          {dancer && (
            <Link href="/profile" className="text-night-muted no-underline hover:text-night-text hover:no-underline">
              {t.nav.profile}
            </Link>
          )}
          <span className="hidden text-night-disabled sm:inline">{user.email}</span>
          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              className="cursor-pointer rounded-full border-none bg-gradient-admin-cta px-4 py-1.5 text-sm font-bold text-white"
            >
              {t.nav.logout}
            </button>
          </form>
        </div>
      ) : (
        <Link
          href="/login"
          className="rounded-full border border-night-border px-4 py-1.5 text-sm font-medium text-night-text no-underline hover:border-admin-primary hover:no-underline"
        >
          {t.nav.login}
        </Link>
      )}
    </header>
  );
}
