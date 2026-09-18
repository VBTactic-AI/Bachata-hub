import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Input, Select } from "@/components/ui/field";
import { Button, buttonVariants } from "@/components/ui/button";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { StatCard } from "@/components/admin/StatCard";
import { GridIcon, CalendarIcon, PencilIcon, AlertIcon, CheckCircleIcon, ArchiveBoxIcon } from "@/components/admin/icons";
import { EventDeleteButton } from "@/components/admin/events/EventDeleteButton";
import {
  EVENT_TYPE_REGISTRY,
  ALL_EVENT_FORMATS,
  MY_EVENT_STATUS_FILTER_OPTIONS,
  myEventStatusLabel,
  myEventStatusVariant,
  myEventStatusFilterWhere,
} from "@/lib/events/event-type-registry";
import { cn } from "@/lib/cn";

// Мониторинг → "Ивенты (все)" — та же табличная вёрстка, что и
// /admin/content (см. её комментарий), но без фильтра по createdById и с
// другим заголовком. Намеренное дублирование с admin/content/page.tsx (не
// общий компонент) — разные списки (все/свои), см. существующий комментарий
// в этом же файле до редизайна (CLAUDE.md §54).
//
// KPI-плитки (2026-09-18, по прямому запросу пользователя — "добавь туда
// плиточки как в админ панели ивентов") — тот же набор и та же логика
// (StatCard-ссылка-фильтр, active подсвечивает применённый статус), что и на
// /admin/content, но без createdById (здесь события ВСЕХ организаторов).
type SearchParams = { q?: string; format?: string; status?: string; when?: string };

function buildHref(current: SearchParams, overrides: Partial<SearchParams>) {
  const merged = { ...current, ...overrides };
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(merged)) {
    if (value) qs.set(key, value);
  }
  const s = qs.toString();
  return s ? `/admin/system/events?${s}` : "/admin/system/events";
}

export default async function SystemEventsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isAdmin(user)) redirect("/admin");

  const sp = await searchParams;
  const format = ALL_EVENT_FORMATS.find((f) => f === sp.format);
  const upcomingWhere = sp.when === "upcoming" ? { startsAt: { gte: new Date() } } : {};

  const [events, totalCount, upcomingCount, draftCount, pendingCount, publishedCount, archivedCount] = await Promise.all([
    prisma.event.findMany({
      where: {
        ...myEventStatusFilterWhere(sp.status),
        ...upcomingWhere,
        ...(format ? { format } : {}),
        ...(sp.q ? { title: { contains: sp.q, mode: "insensitive" } } : {}),
      },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, format: true, status: true, moderationStatus: true, isArchived: true },
    }),
    prisma.event.count({ where: myEventStatusFilterWhere(undefined) }),
    prisma.event.count({ where: { status: { not: "ARCHIVED" }, startsAt: { gte: new Date() } } }),
    prisma.event.count({ where: myEventStatusFilterWhere("DRAFT") }),
    prisma.event.count({ where: myEventStatusFilterWhere("PENDING") }),
    prisma.event.count({ where: myEventStatusFilterWhere("PUBLISHED") }),
    prisma.event.count({ where: myEventStatusFilterWhere("ARCHIVED") }),
  ]);

  const hasActiveFilter = Boolean(sp.q || sp.format || sp.status || sp.when);
  const totalActive = !hasActiveFilter;
  function statusTileHref(value: "DRAFT" | "PENDING" | "PUBLISHED" | "ARCHIVED") {
    return buildHref({ q: sp.q, format: sp.format }, { status: sp.status === value ? undefined : value, when: undefined });
  }
  function upcomingTileHref() {
    return buildHref({ q: sp.q, format: sp.format }, { when: sp.when === "upcoming" ? undefined : "upcoming", status: undefined });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="m-0 font-night text-xl font-extrabold text-night-text sm:text-2xl">Все события</h1>
          <p className="m-0 mt-1 text-sm text-admin-muted">Мониторинг — видны и редактируемы ВСЕ события всех организаторов.</p>
        </div>
        <a href="/admin/system/events/new" className={cn(buttonVariants({ variant: "admin", size: "sm" }), "no-underline")}>
          Создать событие
        </a>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Всего" value={totalCount} icon={<GridIcon />} tone="primary" href="/admin/system/events" active={totalActive} />
        <StatCard label="Актуальные" value={upcomingCount} icon={<CalendarIcon />} tone="success" href={upcomingTileHref()} active={sp.when === "upcoming"} />
        <StatCard label="Черновики" value={draftCount} icon={<PencilIcon />} tone="primary" href={statusTileHref("DRAFT")} active={sp.status === "DRAFT"} />
        <StatCard label="На модерации" value={pendingCount} icon={<AlertIcon />} tone="danger" href={statusTileHref("PENDING")} active={sp.status === "PENDING"} />
        <StatCard
          label="Опубликовано"
          value={publishedCount}
          icon={<CheckCircleIcon />}
          tone="success"
          href={statusTileHref("PUBLISHED")}
          active={sp.status === "PUBLISHED"}
        />
        <StatCard label="В архиве" value={archivedCount} icon={<ArchiveBoxIcon />} tone="primary" href={statusTileHref("ARCHIVED")} active={sp.status === "ARCHIVED"} />
      </div>

      <form method="get" className="flex flex-wrap items-end gap-2 rounded-app border border-admin-border bg-admin-card/50 p-3">
        <label className="flex flex-col gap-1 text-xs text-admin-muted">
          Поиск
          <Input
            type="text"
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Название события…"
            className="max-w-[220px] border-admin-border bg-admin-card2 py-1.5 text-sm text-night-text focus:border-admin-primary focus:ring-admin-primary/20"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-admin-muted">
          Тип
          <Select
            name="format"
            defaultValue={sp.format ?? ""}
            className="max-w-[200px] border-admin-border bg-admin-card2 py-1.5 text-sm text-night-text focus:border-admin-primary focus:ring-admin-primary/20"
          >
            <option value="">Все типы</option>
            {ALL_EVENT_FORMATS.map((f) => (
              <option key={f} value={f}>
                {EVENT_TYPE_REGISTRY[f].icon} {EVENT_TYPE_REGISTRY[f].label}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-admin-muted">
          Статус
          <Select
            name="status"
            defaultValue={sp.status ?? ""}
            className="max-w-[180px] border-admin-border bg-admin-card2 py-1.5 text-sm text-night-text focus:border-admin-primary focus:ring-admin-primary/20"
          >
            <option value="">Все, кроме архива</option>
            {MY_EVENT_STATUS_FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </label>
        <Button type="submit" size="sm">
          Найти
        </Button>
        {hasActiveFilter && (
          <a href="/admin/system/events" className="text-sm text-admin-muted hover:text-night-text hover:underline">
            Сбросить
          </a>
        )}
      </form>

      {events.length === 0 ? (
        <p className="text-sm text-admin-muted">{hasActiveFilter ? "Ничего не найдено по текущему фильтру." : "Событий пока нет."}</p>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-app border border-admin-border sm:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-admin-card2 text-xs font-semibold uppercase tracking-wide text-admin-disabled">
                <tr>
                  <th className="px-3 py-2 font-semibold">Название</th>
                  <th className="px-3 py-2 font-semibold">Тип события</th>
                  <th className="px-3 py-2 font-semibold">Статус</th>
                  <th className="px-3 py-2 font-semibold">Действия</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id} className="border-t border-admin-border hover:bg-admin-card2/50">
                    <td className="px-3 py-2 align-top">
                      {/* Клик по названию = "Управление" (карточка события), как и на
                          /admin/content — по прямому уточнению пользователя. */}
                      <a href={`/admin/content/${e.id}`} className="font-medium text-night-text hover:text-admin-primaryHover hover:underline">
                        {e.title || "Без названия"}
                      </a>
                    </td>
                    <td className="px-3 py-2 align-top text-admin-muted">
                      {EVENT_TYPE_REGISTRY[e.format].icon} {EVENT_TYPE_REGISTRY[e.format].label}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <StatusBadge label={myEventStatusLabel(e.status, e.moderationStatus, e.isArchived)} variant={myEventStatusVariant(e.status, e.moderationStatus, e.isArchived)} />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="flex items-center gap-1">
                        <a
                          href={`/admin/content/${e.id}`}
                          className="rounded-app-sm px-2 py-1 text-xs font-semibold text-admin-primaryHover hover:bg-admin-card2 hover:underline"
                        >
                          Управление
                        </a>
                        <a
                          href={`/admin/system/events/edit/${e.id}`}
                          className="rounded-app-sm px-2 py-1 text-xs font-semibold text-night-text hover:bg-admin-card2 hover:underline"
                        >
                          Редактировать
                        </a>
                        <EventDeleteButton eventId={e.id} title={e.title} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-2 sm:hidden">
            {events.map((e) => (
              <div key={e.id} className="rounded-app-sm border border-admin-border bg-admin-card p-3">
                <div className="flex items-start justify-between gap-2">
                  <a href={`/admin/content/${e.id}`} className="font-medium text-night-text hover:text-admin-primaryHover hover:underline">
                    {e.title || "Без названия"}
                  </a>
                  <EventDeleteButton eventId={e.id} title={e.title} />
                </div>
                <p className="m-0 mt-1 text-xs text-admin-muted">
                  {EVENT_TYPE_REGISTRY[e.format].icon} {EVENT_TYPE_REGISTRY[e.format].label}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <StatusBadge label={myEventStatusLabel(e.status, e.moderationStatus, e.isArchived)} variant={myEventStatusVariant(e.status, e.moderationStatus, e.isArchived)} />
                  <a href={`/admin/content/${e.id}`} className="text-xs font-semibold text-admin-primaryHover hover:underline">
                    Управление →
                  </a>
                  <a href={`/admin/system/events/edit/${e.id}`} className="text-xs font-semibold text-night-text hover:underline">
                    Редактировать →
                  </a>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
