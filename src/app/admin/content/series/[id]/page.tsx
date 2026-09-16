import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEventSeries, listSeriesOccurrences, EventSeriesForbiddenError, EventSeriesNotFoundError } from "@/server/events/event-series-service";
import { describeRecurrenceRule } from "@/lib/events/recurrence-labels";
import type { RecurrenceRule } from "@/server/events/recurrence";
import { StatCard } from "@/components/admin/StatCard";
import { StatusBadge, type StatusBadgeVariant } from "@/components/admin/StatusBadge";
import { PostActionButton } from "@/components/admin/events/PostActionButton";
import { EventDeleteButton } from "@/components/admin/events/EventDeleteButton";
import { SeriesRecurrenceEditor } from "@/components/admin/events/SeriesRecurrenceEditor";
import { RepeatIcon, DatabaseIcon, GearIcon, CopyIcon, PauseIcon, PlayIcon, ArchiveBoxIcon, CheckCircleIcon } from "@/components/admin/icons";
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
const OCC_STATUS_LABEL: Record<string, string> = { DRAFT: "Черновик", PUBLISHED: "Опубликовано", ARCHIVED: "Отменено" };
const OCC_STATUS_VARIANT: Record<string, StatusBadgeVariant> = { DRAFT: "neutral", PUBLISHED: "success", ARCHIVED: "danger" };

export default async function EventSeriesDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cursor?: string; edit?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const { cursor, edit } = await searchParams;

  let series;
  try {
    series = await getEventSeries(id, user);
  } catch (e) {
    if (e instanceof EventSeriesNotFoundError) notFound();
    if (e instanceof EventSeriesForbiddenError) redirect("/admin/content/series");
    throw e;
  }

  const [{ items: occurrences, nextCursor }, futureCount, totalCount, nextOccurrence] = await Promise.all([
    listSeriesOccurrences(id, user, { limit: 20, cursor, includePast: true }),
    prisma.event.count({ where: { seriesId: id, startsAt: { gte: new Date() }, status: { not: "ARCHIVED" } } }),
    prisma.event.count({ where: { seriesId: id } }),
    prisma.event.findFirst({ where: { seriesId: id, startsAt: { gte: new Date() }, status: { not: "ARCHIVED" } }, orderBy: { occurrenceDate: "asc" } }),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <Link href="/admin/content/series" className="text-sm text-admin-muted hover:text-night-text hover:underline">
        ← К списку серий
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <StatusBadge label={STATUS_LABEL[series.status]} variant={STATUS_VARIANT[series.status]} className="mb-2" />
          <h1 className="m-0 font-night text-xl font-extrabold text-night-text sm:text-2xl">{series.name}</h1>
          <p className="m-0 mt-1 text-sm text-admin-muted">
            {describeRecurrenceRule(series.recurrenceRule as unknown as RecurrenceRule)} · {series.defaultStartTime}
            {series.defaultEndTime ? `–${series.defaultEndTime}` : ""} · {series.venueName}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SeriesRecurrenceEditor
            series={{
              id: series.id,
              recurrenceRule: series.recurrenceRule as unknown as RecurrenceRule,
              endDate: series.endDate,
              generationHorizonDays: series.generationHorizonDays,
              autoPublish: series.autoPublish,
              publishDaysBefore: series.publishDaysBefore,
              publishAtTime: series.publishAtTime,
            }}
            autoOpen={edit === "1"}
          />
          <PostActionButton endpoint={`/api/event-series/${series.id}/duplicate`} icon={<CopyIcon />} label="Дублировать" variant="full" />
          {series.status === "ACTIVE" && (
            <PostActionButton endpoint={`/api/event-series/${series.id}/pause`} icon={<PauseIcon />} label="Пауза серии" variant="full" />
          )}
          {series.status === "PAUSED" && (
            <PostActionButton endpoint={`/api/event-series/${series.id}/resume`} icon={<PlayIcon />} label="Возобновить" variant="full" />
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Будущих событий" value={futureCount} icon={<RepeatIcon />} tone="primary" />
        <StatCard label="Ближайшее" value={nextOccurrence ? formatDateTime(nextOccurrence.startsAt) : "—"} icon={<RepeatIcon />} tone="primary" />
        <StatCard
          label="Автопубликация"
          value={series.autoPublish ? `за ${series.publishDaysBefore} дн., в ${series.publishAtTime}` : "выключена"}
          icon={<CheckCircleIcon />}
          tone="success"
        />
        <StatCard label="Всего occurrences" value={totalCount} icon={<DatabaseIcon />} tone="primary" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="overflow-x-auto rounded-app border border-admin-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-admin-card2 text-xs font-semibold uppercase tracking-wide text-admin-disabled">
              <tr>
                <th className="px-3 py-2 font-semibold">Дата</th>
                <th className="px-3 py-2 font-semibold">Событие</th>
                <th className="px-3 py-2 font-semibold">Статус</th>
                <th className="px-3 py-2 font-semibold">Действия</th>
              </tr>
            </thead>
            <tbody>
              {occurrences.map((o) => {
                const overridden = o.title !== series.name;
                return (
                  <tr key={o.id} className="border-t border-admin-border hover:bg-admin-card2/50">
                    <td className="px-3 py-2 align-top text-admin-muted">{formatDateTime(o.startsAt)}</td>
                    <td className={cn("px-3 py-2 align-top font-medium", overridden ? "text-admin-violet" : "text-night-text")}>{o.title}</td>
                    <td className="px-3 py-2 align-top">
                      <StatusBadge label={OCC_STATUS_LABEL[o.status] ?? o.status} variant={OCC_STATUS_VARIANT[o.status] ?? "neutral"} />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="flex items-center gap-1">
                        <Link
                          href={`/admin/content/${o.id}`}
                          title="Открыть"
                          aria-label="Открыть событие"
                          className="inline-flex items-center justify-center rounded-app-sm p-1.5 text-admin-muted hover:bg-admin-card2 hover:text-admin-primaryHover"
                        >
                          <GearIcon />
                        </Link>
                        {o.status !== "ARCHIVED" && <EventDeleteButton eventId={o.id} title={o.title} />}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {occurrences.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-sm text-admin-muted">
                    Occurrences ещё не сгенерированы — следующий проход cron создаст их автоматически.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {nextCursor && (
            <div className="border-t border-admin-border p-2 text-center">
              <Link href={`/admin/content/series/${series.id}?cursor=${nextCursor}`} className="text-sm text-admin-primaryHover hover:underline">
                Показать ещё →
              </Link>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <div className="rounded-app border border-admin-border bg-admin-card2 p-4">
            <p className="m-0 mb-3 text-xs font-bold uppercase tracking-wide text-admin-muted">Параметры серии</p>
            <dl className="m-0 flex flex-col gap-2 text-sm">
              <Row k="Часовой пояс" v={series.timezone} />
              <Row k="Начало серии" v={series.startDate.toLocaleDateString("ru-RU")} />
              <Row k="Окончание" v={series.endDate ? series.endDate.toLocaleDateString("ru-RU") : "Бессрочно"} />
              <Row k="Горизонт генерации" v={`${series.generationHorizonDays} дн.`} />
              <Row k="Порог досоздания" v={`${series.generationThresholdDays} дн.`} />
            </dl>
          </div>

          <div className="rounded-app border border-admin-border bg-admin-card2 p-4">
            <p className="m-0 text-xs font-bold uppercase tracking-wide text-admin-muted">Опасная зона</p>
            <p className="m-0 mt-1 mb-3 text-xs text-admin-muted">Будущие occurrences не удаляются — генерация и автопубликация просто остановятся.</p>
            {series.status !== "ARCHIVED" ? (
              <PostActionButton
                endpoint={`/api/event-series/${series.id}/archive`}
                icon={<ArchiveBoxIcon />}
                label="Архивировать серию"
                tone="danger"
                variant="full"
                confirmText={`Архивировать серию «${series.name}»?`}
              />
            ) : (
              <p className="m-0 text-sm text-admin-muted">Серия в архиве.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-admin-border pt-2 first:border-t-0 first:pt-0">
      <dt className="text-admin-muted">{k}</dt>
      <dd className="m-0 font-semibold text-night-text">{v}</dd>
    </div>
  );
}
