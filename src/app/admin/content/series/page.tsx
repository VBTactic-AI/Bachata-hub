import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, canCreateEvents } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listEventSeriesForUser } from "@/server/events/event-series-service";
import { StatCard } from "@/components/admin/StatCard";
import { StatusBadge, type StatusBadgeVariant } from "@/components/admin/StatusBadge";
import { RepeatIcon, CheckCircleIcon, PauseIcon, PlayIcon, GearIcon, PencilIcon, ArchiveBoxIcon } from "@/components/admin/icons";
import { PostActionButton } from "@/components/admin/events/PostActionButton";
import { buttonVariants } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { EventSeriesStatus } from "@prisma/client";

const STATUS_LABEL: Record<EventSeriesStatus, string> = {
  DRAFT: "Черновик",
  ACTIVE: "Активна",
  PAUSED: "На паузе",
  ENDED: "Завершена",
  ARCHIVED: "В архиве",
};
const STATUS_VARIANT: Record<EventSeriesStatus, StatusBadgeVariant> = {
  DRAFT: "neutral",
  ACTIVE: "success",
  PAUSED: "warning",
  ENDED: "neutral",
  ARCHIVED: "neutral",
};

// Список серий (Recurring Events v2). Новая серия НЕ создаётся здесь —
// кнопка "Новая серия" ведёт в обычный Create Event Wizard, где на шаге
// "Публикация" организатор отмечает "Сделать регулярным" (см. комментарий у
// createSeriesFromEvent, src/server/events/event-series-service.ts).
export default async function EventSeriesListPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canCreateEvents(user)) redirect("/admin");

  const series = await listEventSeriesForUser(user);

  const rows = await Promise.all(
    series.map(async (s) => {
      const [next, futureCount] = await Promise.all([
        prisma.event.findFirst({
          where: { seriesId: s.id, startsAt: { gte: new Date() }, status: { not: "ARCHIVED" } },
          orderBy: { occurrenceDate: "asc" },
          select: { startsAt: true },
        }),
        prisma.event.count({ where: { seriesId: s.id, startsAt: { gte: new Date() }, status: { not: "ARCHIVED" } } }),
      ]);
      return { series: s, next: next?.startsAt ?? null, futureCount };
    })
  );

  const totalCount = series.length;
  const activeCount = series.filter((s) => s.status === "ACTIVE").length;
  const pausedCount = series.filter((s) => s.status === "PAUSED").length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="m-0 font-night text-xl font-extrabold text-night-text sm:text-2xl">Регулярные события</h1>
          <p className="m-0 mt-1 max-w-prose text-sm text-admin-muted">
            Серия сама создаёт и публикует будущие события. Новая серия начинается из обычного создания события — на шаге «Публикация» отметьте
            «Сделать регулярным».
          </p>
        </div>
        <Link href="/admin/content/new" className={cn(buttonVariants({ variant: "admin", size: "sm" }), "no-underline")}>
          Новая серия
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Всего серий" value={totalCount} icon={<RepeatIcon />} tone="primary" />
        <StatCard label="Активны" value={activeCount} icon={<CheckCircleIcon />} tone="success" />
        <StatCard label="На паузе" value={pausedCount} icon={<PauseIcon />} tone="danger" />
      </div>

      {series.length === 0 ? (
        <p className="text-sm text-admin-muted">Регулярных серий пока нет.</p>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-app border border-admin-border sm:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-admin-card2 text-xs font-semibold uppercase tracking-wide text-admin-disabled">
                <tr>
                  <th className="px-3 py-2 font-semibold">Серия</th>
                  <th className="px-3 py-2 font-semibold">Следующее</th>
                  <th className="px-3 py-2 font-semibold">Статус</th>
                  <th className="px-3 py-2 font-semibold">Действия</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ series: s, next, futureCount }) => (
                  <tr key={s.id} className="border-t border-admin-border hover:bg-admin-card2/50">
                    <td className="px-3 py-2 align-top">
                      <Link href={`/admin/content/series/${s.id}`} className="block font-medium text-night-text hover:text-admin-primaryHover hover:underline">
                        {s.name}
                      </Link>
                      <p className="m-0 text-xs text-admin-muted">{s.venueName}</p>
                    </td>
                    <td className="px-3 py-2 align-top text-admin-muted">{next ? `${formatDateTime(next)} · ${futureCount} в очереди` : "—"}</td>
                    <td className="px-3 py-2 align-top">
                      <StatusBadge label={STATUS_LABEL[s.status]} variant={STATUS_VARIANT[s.status]} />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="flex items-center gap-1">
                        <Link
                          href={`/admin/content/series/${s.id}`}
                          title="Открыть"
                          aria-label="Открыть серию"
                          className="inline-flex items-center justify-center rounded-app-sm p-1.5 text-admin-muted hover:bg-admin-card2 hover:text-admin-primaryHover"
                        >
                          <GearIcon />
                        </Link>
                        {s.status !== "ARCHIVED" && (
                          <Link
                            href={`/admin/content/series/${s.id}?edit=1`}
                            title="Редактировать"
                            aria-label="Редактировать серию"
                            className="inline-flex items-center justify-center rounded-app-sm p-1.5 text-admin-muted hover:bg-admin-card2 hover:text-night-text"
                          >
                            <PencilIcon />
                          </Link>
                        )}
                        {s.status === "ACTIVE" && <PostActionButton endpoint={`/api/event-series/${s.id}/pause`} icon={<PauseIcon />} label="Пауза" />}
                        {s.status === "PAUSED" && <PostActionButton endpoint={`/api/event-series/${s.id}/resume`} icon={<PlayIcon />} label="Возобновить" />}
                        {s.status !== "ARCHIVED" && (
                          <PostActionButton
                            endpoint={`/api/event-series/${s.id}/archive`}
                            icon={<ArchiveBoxIcon />}
                            label="Удалить"
                            tone="danger"
                            confirmText={`Удалить серию «${s.name}»? Она уйдёт в архив — генерация и автопубликация остановятся, уже созданные события останутся.`}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-2 sm:hidden">
            {rows.map(({ series: s, next, futureCount }) => (
              <div key={s.id} className="rounded-app-sm border border-admin-border bg-admin-card p-3">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/admin/content/series/${s.id}`} className="block truncate font-medium text-night-text hover:text-admin-primaryHover hover:underline">
                    {s.name}
                  </Link>
                  <StatusBadge label={STATUS_LABEL[s.status]} variant={STATUS_VARIANT[s.status]} />
                </div>
                <p className="m-0 mt-0.5 truncate text-xs text-admin-muted">
                  {s.venueName} · {next ? `${formatDateTime(next)} · ${futureCount} в очереди` : "нет будущих событий"}
                </p>
                <div className="mt-2 flex items-center gap-1">
                  {s.status !== "ARCHIVED" && (
                    <Link
                      href={`/admin/content/series/${s.id}?edit=1`}
                      title="Редактировать"
                      aria-label="Редактировать серию"
                      className="inline-flex items-center justify-center rounded-app-sm p-1.5 text-admin-muted hover:bg-admin-card2 hover:text-night-text"
                    >
                      <PencilIcon />
                    </Link>
                  )}
                  {s.status === "ACTIVE" && <PostActionButton endpoint={`/api/event-series/${s.id}/pause`} icon={<PauseIcon />} label="Пауза" />}
                  {s.status === "PAUSED" && <PostActionButton endpoint={`/api/event-series/${s.id}/resume`} icon={<PlayIcon />} label="Возобновить" />}
                  {s.status !== "ARCHIVED" && (
                    <PostActionButton
                      endpoint={`/api/event-series/${s.id}/archive`}
                      icon={<ArchiveBoxIcon />}
                      label="Удалить"
                      tone="danger"
                      confirmText={`Удалить серию «${s.name}»? Она уйдёт в архив — генерация и автопубликация остановятся, уже созданные события останутся.`}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
