import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { listFestivalsForUser, computeFestivalStatus } from "@/server/events/festival-service";
import { StatCard } from "@/components/admin/StatCard";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { buttonVariants } from "@/components/ui/button";
import { GridIcon, CheckCircleIcon, AlertIcon } from "@/components/admin/icons";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/cn";

const STATUS_LABELS = { DRAFT: "Черновик", LINKED: "Не опубликован", PUBLISHED: "Опубликован" } as const;
const STATUS_VARIANTS = { DRAFT: "neutral", LINKED: "warning", PUBLISHED: "success" } as const;

// Хаб фестивалей — тот же дух, что и "Мои события" (/admin/content), но
// сильно проще: у Festival всего 6 полей и нет мастера создания (форма на
// одной странице, /admin/festival/new). Список фестивалей организатора
// обычно короткий (единицы, не сотни) — фильтры/пагинация не заводятся,
// пока не появится реальная потребность.
export default async function FestivalHubPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isVerifiedFestivalOrganizer && !isAdmin(user)) redirect("/admin");

  const festivals = await listFestivalsForUser(user);
  const withStatus = festivals.map((f) => ({ festival: f, status: computeFestivalStatus(f) }));
  const publishedCount = withStatus.filter((f) => f.status === "PUBLISHED").length;
  const draftCount = withStatus.filter((f) => f.status === "DRAFT").length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0 font-night text-xl font-extrabold text-night-text sm:text-2xl">Фестивали</h1>
        <Link href="/admin/festival/new" className={cn(buttonVariants({ variant: "admin" }), "no-underline")}>
          + Создать фестиваль
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Всего" value={festivals.length} icon={<GridIcon />} tone="primary" />
        <StatCard label="Опубликовано" value={publishedCount} icon={<CheckCircleIcon />} tone="success" />
        <StatCard label="Черновики" value={draftCount} icon={<AlertIcon />} tone="danger" />
      </div>

      {festivals.length === 0 ? (
        <div className="rounded-app border border-admin-border bg-admin-card p-6 text-center">
          <p className="m-0 text-night-text">Пока нет ни одного фестиваля.</p>
          <p className="m-0 mt-1 text-sm text-admin-muted">Создайте первый — это займёт меньше минуты.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {withStatus.map(({ festival, status }) => (
            <Link
              key={festival.id}
              href={`/admin/festival/${festival.id}`}
              className="block rounded-app border border-admin-border bg-admin-card p-4 no-underline transition-colors hover:border-admin-primary/60 hover:no-underline"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="text-night-text">{festival.name}</strong>
                <StatusBadge label={STATUS_LABELS[status]} variant={STATUS_VARIANTS[status]} />
              </div>
              <p className="m-0 mt-1 text-sm text-admin-muted">
                {formatDateTime(festival.startsAt)}
                {festival.venueName ? ` · ${festival.venueName}` : ""}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
