import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { getCurrentUser, canCreateEvents } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Input, Select } from "@/components/ui/field";
import { DateFilterField } from "@/components/ui/DateFilterField";
import { Button, buttonVariants } from "@/components/ui/button";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { StatCard } from "@/components/admin/StatCard";
import { GridIcon, PencilIcon, CheckCircleIcon, AlertIcon, GearIcon, RepeatIcon, PlayIcon, ArchiveBoxIcon, CalendarIcon } from "@/components/admin/icons";
import { EventDeleteButton } from "@/components/admin/events/EventDeleteButton";
import { EventDuplicateButton } from "@/components/admin/events/EventDuplicateButton";
import { PostActionButton } from "@/components/admin/events/PostActionButton";
import {
  EVENT_TYPE_REGISTRY,
  ALL_EVENT_FORMATS,
  MY_EVENT_STATUS_FILTER_OPTIONS,
  myEventStatusLabel,
  myEventStatusVariant,
  myEventStatusFilterWhere,
  type MyEventStatusVariant,
} from "@/lib/events/event-type-registry";
import { formatEventDateRange } from "@/lib/format";
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
//
// Третий проход (2026-09-18, по прямому запросу пользователя, UI-аудит):
// - Плитки "В архиве" (тот же статус-фильтр, что уже был в Select, просто
//   раньше не имел своей плитки) и "Актуальные" (НЕ статус — отдельная ось
//   "when=upcoming": не в архиве И startsAt ещё не наступил, см. `whenWhere`).
// - Фильтр по датам (С даты / По дату) — тот же DateFilterField и та же
//   логика (`gte`/`lt +1 день`), что уже используется на публичной /events
//   (searchEvents() в lib/events.ts), раньше здесь отсутствовала.
// - Пагинация (findMany без take/skip раньше грузил СРАЗУ ВСЕ события
//   организатора) — тот же паттерн `?page=`, что и на "Участниках"
//   (registrations/page.tsx): 20 на страницу, номер страницы в query, "Назад/
//   Вперёд" внизу. Другие списки этого раздела (Регулярные события, Шаблоны)
//   пагинацию не получили — там одна строка на серию/шаблон, а не на каждое
//   их порождённое событие, поэтому естественный размер списка у организатора
//   на порядки меньше и не растёт так же быстро.
// - "Дублировать" (иконка рядом с "Редактировать"/"Удалить") — копия всегда
//   уходит в DRAFT, см. duplicateEvent() в event-service.ts. Не показывается
//   для формата "Конкурс" (CONTEST) — конкурсы теперь заводятся только через
//   /admin/competitions/new, дублировать через этот путь их нельзя.
type SearchParams = {
  q?: string;
  format?: string;
  status?: string;
  regular?: string;
  when?: string;
  from?: string;
  to?: string;
  page?: string;
};

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

const PAGE_SIZE = 20;

export default async function AdminContentPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canCreateEvents(user)) redirect("/admin");

  const sp = await searchParams;
  const format = ALL_EVENT_FORMATS.find((f) => f === sp.format);
  const hasActiveFilter = Boolean(sp.q || sp.format || sp.status || sp.regular || sp.when || sp.from || sp.to);
  const regularWhere = sp.regular === "yes" ? { seriesId: { not: null } } : sp.regular === "no" ? { seriesId: null } : {};

  // "Актуальные" (2026-09-18) — не статус, а отдельная ось "когда": ещё не
  // наступило. Независима от sp.status (можно, например, одновременно
  // смотреть "Черновики" + "Актуальные" — черновики, у которых дата ещё в
  // будущем); архив уже и так исключён статусным фильтром по умолчанию
  // (myEventStatusFilterWhere(undefined) => status.not = ARCHIVED), явно
  // дублировать это условие здесь не нужно.
  //
  // Диапазон дат (С даты / По дату) — тот же приём, что и searchEvents() для
  // публичной /events (lib/events.ts): "По дату" включительно, поэтому
  // верхняя граница — начало СЛЕДУЮЩЕГО дня, не сам день. Обе оси пишут в
  // один и тот же startsAt-фильтр (не в отдельные объекты, которые бы просто
  // перезаписали друг друга при спреде одного и того же ключа) — если задано
  // и "Актуальные", и "С даты", нижней границей становится более поздняя.
  const startsAtFilter: Prisma.DateTimeFilter = {};
  if (sp.when === "upcoming") startsAtFilter.gte = new Date();
  if (sp.from) {
    const fromDate = new Date(sp.from);
    startsAtFilter.gte = startsAtFilter.gte && startsAtFilter.gte > fromDate ? startsAtFilter.gte : fromDate;
  }
  if (sp.to) {
    const d = new Date(sp.to);
    d.setDate(d.getDate() + 1);
    startsAtFilter.lt = d;
  }

  const page = Math.max(1, Number(sp.page) || 1);

  const where: Prisma.EventWhereInput = {
    createdById: user.id,
    ...myEventStatusFilterWhere(sp.status),
    ...(format ? { format } : {}),
    ...(sp.q ? { title: { contains: sp.q, mode: "insensitive" } } : {}),
    ...regularWhere,
    ...(Object.keys(startsAtFilter).length > 0 ? { startsAt: startsAtFilter } : {}),
  };

  const [events, filteredCount, totalCount, draftCount, pendingCount, publishedCount, archivedCount, upcomingCount] = await Promise.all([
    prisma.event.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        title: true,
        format: true,
        status: true,
        moderationStatus: true,
        photoUrl: true,
        startsAt: true,
        endsAt: true,
        seriesId: true,
        city: { select: { nameRu: true } },
      },
    }),
    prisma.event.count({ where }),
    // KPI-плитки считают ВСЕ свои события целиком, независимо от q/format —
    // тот же принцип, что и totalOverall/waitlistCount на вкладке
    // "Участники" (registrations/page.tsx): числа стабильны, применённый
    // фильтр — отдельно.
    prisma.event.count({ where: { createdById: user.id, ...myEventStatusFilterWhere(undefined) } }),
    prisma.event.count({ where: { createdById: user.id, ...myEventStatusFilterWhere("DRAFT") } }),
    prisma.event.count({ where: { createdById: user.id, ...myEventStatusFilterWhere("PENDING") } }),
    prisma.event.count({ where: { createdById: user.id, ...myEventStatusFilterWhere("PUBLISHED") } }),
    prisma.event.count({ where: { createdById: user.id, ...myEventStatusFilterWhere("ARCHIVED") } }),
    prisma.event.count({ where: { createdById: user.id, status: { not: "ARCHIVED" }, startsAt: { gte: new Date() } } }),
  ]);

  const totalPages = Math.max(Math.ceil(filteredCount / PAGE_SIZE), 1);
  const totalActive = !hasActiveFilter;
  const totalHref = "/admin/content";
  function statusTileHref(value: "DRAFT" | "PENDING" | "PUBLISHED" | "ARCHIVED") {
    return buildHref({ q: sp.q, format: sp.format }, { status: sp.status === value ? undefined : value, when: undefined, page: undefined });
  }
  function upcomingTileHref() {
    return buildHref({ q: sp.q, format: sp.format }, { when: sp.when === "upcoming" ? undefined : "upcoming", status: undefined, page: undefined });
  }
  const currentFilterParams: SearchParams = { q: sp.q, format: sp.format, status: sp.status, regular: sp.regular, when: sp.when, from: sp.from, to: sp.to };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="m-0 font-night text-xl font-extrabold text-night-text sm:text-2xl">Мои события</h1>
          <p className="m-0 mt-1 text-sm text-admin-muted">Вечеринки, мастер-классы, соревнования — всё, что вы создали.</p>
        </div>
        <a href="/admin/content/new" className={cn(buttonVariants({ variant: "admin", size: "sm" }), "no-underline")}>
          Создать новое событие
        </a>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Всего" value={totalCount} icon={<GridIcon />} tone="primary" href={totalHref} active={totalActive} />
        <StatCard
          label="Актуальные"
          value={upcomingCount}
          icon={<CalendarIcon />}
          tone="success"
          href={upcomingTileHref()}
          active={sp.when === "upcoming"}
        />
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
        <StatCard
          label="В архиве"
          value={archivedCount}
          icon={<ArchiveBoxIcon />}
          tone="primary"
          href={statusTileHref("ARCHIVED")}
          active={sp.status === "ARCHIVED"}
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
        <label className="flex flex-col gap-1 text-xs text-admin-muted">
          Регулярность
          <Select
            name="regular"
            defaultValue={sp.regular ?? ""}
            className="max-w-[160px] border-admin-border bg-admin-card2 py-1.5 text-sm text-night-text focus:border-admin-primary focus:ring-admin-primary/20"
          >
            <option value="">Все события</option>
            <option value="yes">Только регулярные</option>
            <option value="no">Только разовые</option>
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-admin-muted">
          С даты
          <DateFilterField name="from" defaultValue={sp.from ?? ""} theme="admin" className="border-admin-border bg-admin-card2 py-1.5 text-sm text-night-text" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-admin-muted">
          По дату
          <DateFilterField name="to" defaultValue={sp.to ?? ""} theme="admin" className="border-admin-border bg-admin-card2 py-1.5 text-sm text-night-text" />
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
                            {/* Клик по названию = "Управление" (карточка события) — по прямому
                                запросу пользователя; "Редактировать" (мастер) — отдельная иконка. */}
                            <div className="flex min-w-0 items-center gap-1.5">
                              <a href={`/admin/content/${e.id}`} className="truncate font-medium text-night-text hover:text-admin-primaryHover hover:underline">
                                {e.title || "Без названия"}
                              </a>
                              {e.seriesId && (
                                <a
                                  href={`/admin/content/series/${e.seriesId}`}
                                  title="Открыть серию"
                                  className="inline-flex shrink-0 items-center gap-1 rounded-app-sm bg-admin-violet/15 px-1.5 py-0.5 text-[10px] font-semibold text-admin-violet hover:bg-admin-violet/25"
                                >
                                  <RepeatIcon /> Регулярное
                                </a>
                              )}
                            </div>
                            <p className="m-0 truncate text-xs text-admin-muted">
                              {e.city.nameRu} · {formatEventDateRange(e.startsAt, e.endsAt)}
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
                          {e.status === "DRAFT" && (
                            <PostActionButton endpoint={`/api/event-drafts/${e.id}/publish`} icon={<PlayIcon />} label="Опубликовать" />
                          )}
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
                          {e.format !== "CONTEST" && <EventDuplicateButton eventId={e.id} title={e.title} />}
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
                        <a href={`/admin/content/${e.id}`} className="block truncate font-medium text-night-text hover:text-admin-primaryHover hover:underline">
                          {e.title || "Без названия"}
                        </a>
                        <div className="flex shrink-0 items-center gap-1">
                          {e.format !== "CONTEST" && <EventDuplicateButton eventId={e.id} title={e.title} />}
                          <EventDeleteButton eventId={e.id} title={e.title} />
                        </div>
                      </div>
                      <p className="m-0 mt-0.5 truncate text-xs text-admin-muted">
                        {EVENT_TYPE_REGISTRY[e.format].label} · {e.city.nameRu} · {formatEventDateRange(e.startsAt, e.endsAt)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <StatusBadge label={myEventStatusLabel(e.status, e.moderationStatus)} variant={variant} />
                    {e.seriesId && (
                      <a
                        href={`/admin/content/series/${e.seriesId}`}
                        className="inline-flex items-center gap-1 rounded-app-sm bg-admin-violet/15 px-1.5 py-0.5 text-[10px] font-semibold text-admin-violet hover:bg-admin-violet/25"
                      >
                        <RepeatIcon /> Регулярное
                      </a>
                    )}
                    {e.status === "DRAFT" && (
                      <PostActionButton endpoint={`/api/event-drafts/${e.id}/publish`} icon={<PlayIcon />} label="Опубликовать" variant="full" />
                    )}
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

      {totalPages > 1 && (
        <div className="flex items-center gap-3 text-sm text-admin-muted">
          {page > 1 && (
            <a href={buildHref(currentFilterParams, { page: String(page - 1) })} className="hover:text-night-text hover:underline">
              ← Назад
            </a>
          )}
          <span>
            Страница {page} из {totalPages} ({filteredCount} {filteredCount === 1 ? "событие" : "событий"})
          </span>
          {page < totalPages && (
            <a href={buildHref(currentFilterParams, { page: String(page + 1) })} className="hover:text-night-text hover:underline">
              Вперёд →
            </a>
          )}
        </div>
      )}
    </div>
  );
}
