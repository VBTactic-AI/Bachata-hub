import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listFestivalsForUser, computeFestivalStatus } from "@/server/events/festival-service";
import { getEventPassRevenue } from "@/server/events/ticket-service";
import { StatCard } from "@/components/admin/StatCard";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { buttonVariants } from "@/components/ui/button";
import { GridIcon, PeopleIcon, CardIcon, CalendarIcon } from "@/components/admin/icons";
import { formatEventDateRange } from "@/lib/format";
import { cn } from "@/lib/cn";

const STATUS_LABELS = { DRAFT: "Черновик", LINKED: "Не опубликован", PUBLISHED: "Опубликован" } as const;
const STATUS_VARIANTS = { DRAFT: "neutral", LINKED: "warning", PUBLISHED: "success" } as const;

// Хаб фестивалей — тот же дух, что и "Мои события" (/admin/content), но
// сильно проще: у Festival всего 6 полей и нет мастера создания (форма на
// одной странице, /admin/festival/new). Список фестивалей организатора
// обычно короткий (единицы, не сотни) — фильтры/пагинация не заводятся,
// пока не появится реальная потребность.
//
// Карточная сетка + сводные KPI выручки/участников (2026-09-19, перенос
// UI-прототипа Festival Engine, Stage R1 — см. docs/FESTIVAL_SERVICE_LAYER_PLAN.md).
// У Festival нет своего поля обложки (нет прецедента, см. комментарий у
// модели в schema.prisma) — карточка использует тот же приём, что и
// EventCardPreview без photoUrl: градиент + эмодзи-плейсхолдер, не настоящее
// изображение.
export default async function FestivalHubPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isVerifiedFestivalOrganizer && !isAdmin(user)) redirect("/admin");

  const festivals = await listFestivalsForUser(user);
  const withStatus = festivals.map((f) => ({ festival: f, status: computeFestivalStatus(f) }));
  const publishedCount = withStatus.filter((f) => f.status === "PUBLISHED").length;
  const draftCount = withStatus.filter((f) => f.status === "DRAFT").length;
  const inProgressCount = festivals.length - publishedCount;

  // Выручка/участники по каждому фестивалю с уже привязанным bridge-Event —
  // у черновика без eventId продавать ещё нечего, соответствующие карточки
  // просто получают 0, отдельный запрос не нужен.
  const cardStats = await Promise.all(
    withStatus.map(async ({ festival }) => {
      if (!festival.eventId) return { soldCount: 0, revenue: 0 };
      const [soldCount, revenue] = await Promise.all([
        prisma.ticket.count({ where: { eventId: festival.eventId, passId: { not: null }, status: "ISSUED" } }),
        getEventPassRevenue(festival.eventId, user),
      ]);
      return { soldCount, revenue };
    })
  );
  const totalSold = cardStats.reduce((sum, s) => sum + s.soldCount, 0);
  const totalRevenue = cardStats.reduce((sum, s) => sum + s.revenue, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="m-0 font-night text-xl font-extrabold text-night-text sm:text-2xl">Фестивали</h1>
          {festivals.length > 0 && (
            <p className="m-0 mt-1 text-sm text-admin-muted">
              {festivals.length} {festivals.length === 1 ? "фестиваль" : "фестиваля"} · {publishedCount} опубликовано · {inProgressCount} в работе
            </p>
          )}
        </div>
        <Link href="/admin/festival/new" className={cn(buttonVariants({ variant: "admin" }), "no-underline")}>
          Создать фестиваль
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Всего фестивалей" value={festivals.length} icon={<GridIcon />} tone="primary" />
        <StatCard label="Участников (сумм.)" value={totalSold} icon={<PeopleIcon />} tone="success" />
        <StatCard label="Выручка по пассам" value={`${totalRevenue} BYN`} icon={<CardIcon />} tone="primary" />
      </div>

      {festivals.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-app border border-admin-border bg-admin-card p-10 text-center">
          <span className="text-admin-disabled">
            <CalendarIcon />
          </span>
          <p className="m-0 font-semibold text-night-text">Пока нет ни одного фестиваля</p>
          <p className="m-0 max-w-sm text-sm text-admin-muted">Создайте первый — это займёт меньше минуты, программу и пассы можно добавить позже.</p>
          <Link href="/admin/festival/new" className={cn(buttonVariants({ variant: "admin" }), "mt-2 no-underline")}>
            Создать фестиваль
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {withStatus.map(({ festival, status }, i) => (
            <Link
              key={festival.id}
              href={`/admin/festival/${festival.id}`}
              className="flex flex-col overflow-hidden rounded-app border border-admin-border bg-admin-card no-underline transition-colors hover:border-admin-primary/60 hover:no-underline"
            >
              <div className="relative flex h-[74px] shrink-0 items-center justify-center bg-gradient-to-br from-[#1d2b52] to-[#2a1a44] text-2xl">
                <span aria-hidden="true">🎪</span>
                <span className="absolute right-2.5 top-2.5">
                  <StatusBadge label={STATUS_LABELS[status]} variant={STATUS_VARIANTS[status]} />
                </span>
              </div>
              <div className="flex flex-1 flex-col p-3.5">
                <strong className="truncate text-night-text">{festival.name}</strong>
                <p className="m-0 mb-2.5 mt-0.5 truncate text-xs text-admin-muted">
                  {festival.city.nameRu} · {formatEventDateRange(festival.startsAt, festival.endsAt)}
                </p>
                <div className="mt-auto flex items-center justify-between border-t border-admin-border pt-2 text-xs text-admin-muted">
                  <span>Пассов продано</span>
                  <b className="tabular-nums text-night-text">{cardStats[i].soldCount}</b>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
