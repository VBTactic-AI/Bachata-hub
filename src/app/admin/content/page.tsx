import { redirect } from "next/navigation";
import { getCurrentUser, canCreateEvents } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Input, Select } from "@/components/ui/field";
import { Button, buttonVariants } from "@/components/ui/button";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { StatCard } from "@/components/admin/StatCard";
import { GridIcon, PencilIcon, CheckCircleIcon, AlertIcon, GearIcon } from "@/components/admin/icons";
import { EventDeleteButton } from "@/components/admin/events/EventDeleteButton";
import {
  EVENT_TYPE_REGISTRY,
  ALL_EVENT_FORMATS,
  MY_EVENT_STATUS_FILTER_OPTIONS,
  myEventStatusLabel,
  myEventStatusVariant,
  myEventStatusFilterWhere,
  type MyEventStatusVariant,
} from "@/lib/events/event-type-registry";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/cn";

// Табличка "Мои события" (редизайн 2026-09-16, по прямому запросу
// пользователя) — раньше эта страница сразу показывала мастер создания
// события (EventWizard) под списком ссылок; теперь список — самостоятельная
// табличная страница в стиле остальной админки (см. `.../[id]/registrations/
// page.tsx` — тот же паттерн: server-side фильтр через GET-форму без JS,
// таблица на десктопе + карточки на мобильном). Мастер переехал на отдельные
// страницы: "Создать новое событие" → /admin/content/new, "Редактировать" →
// /admin/content/edit/[id] (НЕ /admin/content/[id]/edit — там уже сидит
// `[id]/layout.tsx`, оборачивающий вкладками "карточку одного события", под
// него мастер заезжать не должен).
//
// Второй проход (2026-09-16, по итогам UX-ревью — см. Artifact "Event Engine
// Redline", предложение принято пользователем как есть): KPI-плитки сверху —
// тот же переиспользуемый `StatCard`, что и на вкладке "Участники"
// (registrations/page.tsx), с тем же паттерном "плитка = ссылка-фильтр,
// active подсвечивает уже применённый статус". Строки таблицы получили
// обложку/тинт формата, вторую строку (город · дата) и цветную полосу статуса
// слева; три текстовые/иконочные действия сведены к трём одинаковым
// icon-button (Управление/Редактировать/Удалить).
type SearchParams = { q?: string; format?: string; status?: string };

function buildHref(current: SearchParams, overrides: Partial<SearchParams>) {
  const merged = { ...current, ...overrides };
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(merged)) {
    if (value) qs.set(key, value);
  }
  const s = qs.toString();
  return s ? `/admin/content?${s}` : "/admin/content";
}

const ROW_BORDER_CLASS: Record<MyEventStatusVariant, string> = {
  success: "border-l-night-success",
  danger: "border-l-red-400",
  warning: "border-l-night-warning",
  neutral: "border-l-admin-disabled",
};

export default async function AdminContentPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canCreateEvents(user)) redirect("/admin");

  const sp = await searchParams;
  const format = ALL_EVENT_FORMATS.find((f) => f === sp.format);
  const hasActiveFilter = Boolean(sp.q || sp.format || sp.status);

  const [events, totalCount, draftCount, pendingCount, publishedCount] = await Promise.all([
    prisma.event.findMany({
      where: {
        createdById: user.id,
        ...myEventStatusFilterWhere(sp.status),
        ...(format ? { format } : {}),
        ...(sp.q ? { title: { contains: sp.q, mode: "insensitive" } } : {}),
      },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, format: true, status: true, moderationStatus: true, photoUrl: true, startsAt: true, city: { select: { nameRu: true } } },
    }),
    // KPI-плитки считают ВСЕ свои события целиком, независимо от q/format —
    // тот же принцип, что и totalOverall/waitlistCount на вкладке
    // "Участники" (registrations/page.tsx): числа стабильны, применённый
    // фильтр — отдельно.
    prisma.event.count({ where: { createdById: user.id, ...myEventStatusFilterWhere(undefined) } }),
    prisma.event.count({ where: { createdById: user.id, ...myEventStatusFilterWhere("DRAFT") } }),
    prisma.event.count({ where: { createdById: user.id, ...myEventStatusFilterWhere("PENDING") } }),
    prisma.event.count({ where: { createdById: user.id, ...myEventStatusFilterWhere("PUBLISHED") } }),
  ]);

  const totalActive = !hasActiveFilter;
  const totalHref = "/admin/content";
  function statusTileHref(value: "DRAFT" | "PENDING" | "PUBLISHED") {
    return buildHref({ q: sp.q, format: sp.format }, { status: sp.status === value ? undefined : value });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="m-0 font-night text-xl font-extrabold text-night-text sm:text-2xl">Мои события</h1>
          <p className="m-0 mt-1 text-sm text-admin-muted">Вечеринки, мастер-классы, соревнования — всё, что вы создали.</p>
        </div>
        <a href="/admin/content/new" className={cn(buttonVariants({ variant: "admin", size: "sm" }), "no-underline")}>
          + Создать новое событие
        </a>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Всего" value={totalCount} icon={<GridIcon />} tone="primary" href={totalHref} active={totalActive} />
        <StatCard
          label="Черновики"
          value={draftCount}
          icon={<PencilIcon />}
          tone="primary"
          href={statusTileHref("DRAFT")}
          active={sp.status === "DRAFT"}
        />
        <StatCard
          label="На модерации"
          value={pendingCount}
          icon={<AlertIcon />}
          tone="danger"
          href={statusTileHref("PENDING")}
          active={sp.status === "PENDING"}
        />
        <StatCard
          label="Опубликовано"
          value={publishedCount}
          icon={<CheckCircleIcon />}
          tone="success"
          href={statusTileHref("PUBLISHED")}
          active={sp.status === "PUBLISHED"}
        />
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
          <a href="/admin/content" className="text-sm text-admin-muted hover:text-night-text hover:underline">
            Сбросить
          </a>
        )}
      </form>

      {events.length === 0 ? (
        <p className="text-sm text-admin-muted">
          {hasActiveFilter ? "Ничего не найдено по текущему фильтру." : "Событий пока нет — создайте первое."}
        </p>
      ) : (
        <>
          {/* Desktop/tablet — таблица, тот же стиль, что и вкладка "Участники". */}
          <div className="hidden overflow-x-auto rounded-app border border-admin-border sm:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-admin-card2 text-xs font-semibold uppercase tracking-wide text-admin-disabled">
                <tr>
                  <th className="px-3 py-2 font-semibold">Событие</th>
                  <th className="px-3 py-2 font-semibold">Тип события</th>
                  <th className="px-3 py-2 font-semibold">Статус</th>
                  <th className="px-3 py-2 font-semibold">Действия</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => {
                  const variant = myEventStatusVariant(e.status, e.moderationStatus);
                  return (
                    <tr key={e.id} className={cn("border-t border-l-[3px] border-admin-border hover:bg-admin-card2/50", ROW_BORDER_CLASS[variant])}>
                      <td className="px-3 py-2 align-top">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-app-sm bg-gradient-to-br from-admin-primary/30 to-admin-violet/30 text-base">
                            {e.photoUrl ? (
                              // Небольшая фиксированная миниатюра списка — plain <img>, не next/image
                              // (нет смысла в оптимизации/srcset ради 36px в таблице).
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={e.photoUrl} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <span aria-hidden="true">{EVENT_TYPE_REGISTRY[e.format].icon}</span>
                            )}
                          </div>
                          <div className="min-w-0">
                            {/* Клик по названию = "Редактировать" (мастер) — по прямому запросу
                                пользователя; "Управление" (карточка) — отдельная иконка в действиях. */}
                            <a href={`/admin/content/edit/${e.id}`} className="block truncate font-medium text-night-text hover:text-admin-primaryHover hover:underline">
                              {e.title || "Без названия"}
                            </a>
                            <p className="m-0 truncate text-xs text-admin-muted">
                              {e.city.nameRu} · {formatDateTime(e.startsAt)}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 align-top text-admin-muted">
                        {EVENT_TYPE_REGISTRY[e.format].icon} {EVENT_TYPE_REGISTRY[e.format].label}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <StatusBadge label={myEventStatusLabel(e.status, e.moderationStatus)} variant={variant} />
                      </td>
                      <td className="px-3 py-2 align-top">
                        <div className="flex items-center gap-1">
                          <a
                            href={`/admin/content/${e.id}`}
                            title="Управление"
                            aria-label="Управление событием"
                            className="inline-flex items-center justify-center rounded-app-sm p-1.5 text-admin-muted hover:bg-admin-card2 hover:text-admin-primaryHover"
                          >
                            <GearIcon />
                          </a>
                          <a
                            href={`/admin/content/edit/${e.id}`}
                            title="Редактировать"
                            aria-label="Редактировать событие"
                            className="inline-flex items-center justify-center rounded-app-sm p-1.5 text-admin-muted hover:bg-admin-card2 hover:text-night-text"
                          >
                            <PencilIcon />
                          </a>
                          <EventDeleteButton eventId={e.id} title={e.title} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile — карточки вместо широкой таблицы. */}
          <div className="flex flex-col gap-2 sm:hidden">
            {events.map((e) => {
              const variant = myEventStatusVariant(e.status, e.moderationStatus);
              return (
                <div key={e.id} className={cn("rounded-app-sm border border-l-[3px] border-admin-border bg-admin-card p-3", ROW_BORDER_CLASS[variant])}>
                  <div className="flex items-start gap-2.5">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-app-sm bg-gradient-to-br from-admin-primary/30 to-admin-violet/30 text-lg">
                      {e.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={e.photoUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span aria-hidden="true">{EVENT_TYPE_REGISTRY[e.format].icon}</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <a href={`/admin/content/edit/${e.id}`} className="block truncate font-medium text-night-text hover:text-admin-primaryHover hover:underline">
                          {e.title || "Без названия"}
                        </a>
                        <EventDeleteButton eventId={e.id} title={e.title} />
                      </div>
                      <p className="m-0 mt-0.5 truncate text-xs text-admin-muted">
                        {EVENT_TYPE_REGISTRY[e.format].label} · {e.city.nameRu} · {formatDateTime(e.startsAt)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <StatusBadge label={myEventStatusLabel(e.status, e.moderationStatus)} variant={variant} />
                    <a href={`/admin/content/${e.id}`} className="text-xs font-semibold text-admin-primaryHover hover:underline">
                      Управление →
                    </a>
                    <a href={`/admin/content/edit/${e.id}`} className="text-xs font-semibold text-night-text hover:underline">
                      Редактировать →
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
