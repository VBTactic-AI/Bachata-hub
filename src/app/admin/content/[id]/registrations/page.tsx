import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  listEventRegistrations,
  RegistrationForbiddenError,
  type RegistrationSortBy,
  type RegistrationSortDir,
} from "@/server/events/registration-service";
import { EventRegistrationStatusSelect } from "@/components/admin/events/EventRegistrationStatusSelect";
import { EventRegistrationPaymentToggle } from "@/components/admin/events/EventRegistrationPaymentToggle";
import { StatCard } from "@/components/admin/StatCard";
import { PeopleIcon, CardIcon, AlertIcon } from "@/components/admin/icons";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { formatDateTime } from "@/lib/format";
import {
  EVENT_REGISTRATION_STATUS_LABELS as STATUS_LABELS,
  EVENT_REGISTRATION_STATUS_VALUES as STATUS_VALUES,
} from "@/lib/events/event-type-registry";

// Events Engine, этап 3 — вкладка "Участники" для обычного события (НЕ
// путать с ParticipantsPanel Competition Engine — другой домен, другая
// модель, см. комментарий у EventRegistration в schema.prisma). Owner-check
// делает сам listEventRegistrations (createdById события или ADMIN);
// страница только переводит его RegistrationForbiddenError в редирект.
//
// Вёрстка сознательно повторяет ParticipantsPanel (KPI-карточки сверху,
// таблица на десктопе + список карточек на мобильном, те же admin-*/night-*
// токены и thead-стиль) — по прямому запросу пользователя (2026-09-15):
// "UI админки в таких же цветах и стилях, как уже существующая админка JNJ".
//
// §11 ТЗ (Event CRM, 2026-09-15) — поиск/фильтры/сортировка/экспорт. В
// отличие от ParticipantsPanel (client-side фильтр по уже загруженной
// странице), здесь фильтрация server-side через searchParams — тот же
// паттерн, что и /events (публичный список) и /admin/system/moderation/
// users: обычная GET-форма, без JS, полностью индексируемо/работает без
// клиентского рантайма.

const SORT_VALUES: RegistrationSortBy[] = ["date", "name", "paid"];

type SearchParams = { page?: string; q?: string; status?: string; paid?: string; sort?: string; dir?: string };

function buildHref(basePath: string, current: Record<string, string | undefined>, overrides: Record<string, string | undefined>) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...current, ...overrides })) {
    if (value) qs.set(key, value);
  }
  const s = qs.toString();
  return s ? `${basePath}?${s}` : basePath;
}

export default async function EventRegistrationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const event = await prisma.event.findUnique({
    where: { id },
    select: { id: true, slug: true, title: true, capacity: true, registrationEnabled: true },
  });
  if (!event) notFound();

  const page = Math.max(Number(sp.page) || 1, 1);
  const status = STATUS_VALUES.find((s) => s === sp.status);
  const isPaid = sp.paid === "yes" ? true : sp.paid === "no" ? false : undefined;
  const sortBy = SORT_VALUES.find((s) => s === sp.sort);
  const sortDir: RegistrationSortDir = sp.dir === "desc" ? "desc" : "asc";

  let result;
  try {
    result = await listEventRegistrations(event.id, user, { page, pageSize: 50, search: sp.q, status, isPaid, sortBy, sortDir });
  } catch (e) {
    if (e instanceof RegistrationForbiddenError) redirect("/admin/content");
    throw e;
  }

  const totalPages = Math.max(Math.ceil(result.total / result.pageSize), 1);
  const pctOverall = (count: number) => (result.totalOverall === 0 ? 0 : Math.round((count / result.totalOverall) * 100));

  const basePath = `/admin/content/${event.id}/registrations`;
  // "Текущие" параметры фильтра — переносятся во ВСЕ остальные ссылки
  // (пагинация, сортировка, экспорт), чтобы переключение одного не сбрасывало
  // остальные.
  const currentFilterParams = { q: sp.q, status: sp.status, paid: sp.paid, sort: sp.sort, dir: sp.dir };
  const exportHref = buildHref("/api/events/" + event.slug + "/registrations/export", currentFilterParams, {});

  function sortHref(field: RegistrationSortBy) {
    const nextDir = sortBy === field && sortDir === "asc" ? "desc" : "asc";
    return buildHref(basePath, currentFilterParams, { sort: field, dir: nextDir, page: undefined });
  }
  function sortIndicator(field: RegistrationSortBy) {
    if (sortBy !== field) return null;
    return <span aria-hidden="true">{sortDir === "asc" ? " ▲" : " ▼"}</span>;
  }

  const hasActiveFilter = Boolean(sp.q || sp.status || sp.paid);

  // §11 ТЗ, продолжение (2026-09-15, по прямому запросу пользователя) — сами
  // KPI-карточки одновременно и быстрый фильтр, тот же принцип, что и
  // StatCard в ParticipantsPanel Competition Engine (клик по "Оплачено"/"Не
  // оплачено" переключает фильтр). Здесь — серверная страница, поэтому не
  // onClick, а обычная ссылка (`href` у StatCard уже поддерживает это, см.
  // комментарий там про "проваливание по клику"); повторный клик по уже
  // активной карточке снимает фильтр (тот же toggle, что и в ParticipantsPanel).
  const paidActive = sp.paid === "yes";
  const notPaidActive = sp.paid === "no";
  const waitlistActive = sp.status === "WAITLIST";
  const totalActive = !hasActiveFilter;

  const totalHref = basePath;
  const paidHref = buildHref(basePath, currentFilterParams, { paid: paidActive ? undefined : "yes", page: undefined });
  const notPaidHref = buildHref(basePath, currentFilterParams, { paid: notPaidActive ? undefined : "no", page: undefined });
  const waitlistHref = buildHref(basePath, currentFilterParams, { status: waitlistActive ? undefined : "WAITLIST", page: undefined });

  return (
    <div className="flex flex-col gap-4">
      {/* §12 ТЗ — заголовок/бейджи/breadcrumb события теперь общие для всех
          вкладок, рендерятся один раз в layout.tsx рядом. Здесь остаётся
          только специфичное для "Участников" предупреждение. */}
      {!event.registrationEnabled && (
        <p className="m-0 text-sm text-admin-muted">Регистрация на событии сейчас выключена в настройках мастера.</p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Всего регистраций" value={result.totalOverall} icon={<PeopleIcon />} tone="primary" href={totalHref} active={totalActive} />
        <StatCard
          label="Оплачено"
          value={result.paidCount}
          icon={<CardIcon />}
          tone="success"
          percent={pctOverall(result.paidCount)}
          href={paidHref}
          active={paidActive}
        />
        <StatCard
          label="Не оплачено"
          value={result.totalOverall - result.paidCount}
          icon={<AlertIcon />}
          tone="danger"
          percent={pctOverall(result.totalOverall - result.paidCount)}
          href={notPaidHref}
          active={notPaidActive}
        />
        <StatCard
          label="Лист ожидания"
          value={result.waitlistCount}
          icon={<PeopleIcon />}
          tone="primary"
          percent={pctOverall(result.waitlistCount)}
          href={waitlistHref}
          active={waitlistActive}
        />
      </div>

      <form method="get" className="flex flex-wrap items-end gap-2 rounded-app border border-admin-border bg-admin-card/50 p-3">
        <label className="flex flex-col gap-1 text-xs text-admin-muted">
          Поиск
          <Input
            type="text"
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Имя участника…"
            className="max-w-[220px] border-admin-border bg-admin-card2 py-1.5 text-sm text-night-text focus:border-admin-primary focus:ring-admin-primary/20"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-admin-muted">
          Статус
          <Select
            name="status"
            defaultValue={sp.status ?? ""}
            className="max-w-[180px] border-admin-border bg-admin-card2 py-1.5 text-sm text-night-text focus:border-admin-primary focus:ring-admin-primary/20"
          >
            <option value="">Все статусы</option>
            {STATUS_VALUES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-admin-muted">
          Оплата
          <Select
            name="paid"
            defaultValue={sp.paid ?? ""}
            className="max-w-[150px] border-admin-border bg-admin-card2 py-1.5 text-sm text-night-text focus:border-admin-primary focus:ring-admin-primary/20"
          >
            <option value="">Все</option>
            <option value="yes">Оплачено</option>
            <option value="no">Не оплачено</option>
          </Select>
        </label>
        {/* Сортировка тоже управляется через клик по заголовку колонки ниже —
            эти скрытые поля переносят её значение при отправке формы поиска,
            чтобы фильтр не сбрасывал уже выбранную сортировку. */}
        <input type="hidden" name="sort" value={sp.sort ?? ""} />
        <input type="hidden" name="dir" value={sp.dir ?? ""} />
        <Button type="submit" size="sm">
          Найти
        </Button>
        {hasActiveFilter && (
          <a href={basePath} className="text-sm text-admin-muted hover:text-night-text hover:underline">
            Сбросить
          </a>
        )}
        <a
          href={exportHref}
          className="ml-auto rounded-app-sm border border-admin-border px-3 py-1.5 text-sm text-night-text no-underline hover:bg-admin-card2"
        >
          Экспорт CSV
        </a>
      </form>

      {result.items.length === 0 ? (
        <p className="text-sm text-admin-muted">{hasActiveFilter ? "Ничего не найдено по текущему фильтру." : "Пока никто не зарегистрировался."}</p>
      ) : (
        <>
          {/* Desktop/tablet — компактная таблица, тот же стиль, что и ParticipantsPanel. */}
          <div className="hidden overflow-x-auto rounded-app border border-admin-border sm:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-admin-card2 text-xs font-semibold uppercase tracking-wide text-admin-disabled">
                <tr>
                  <th className="px-3 py-2 font-semibold">
                    <a href={sortHref("name")} className="hover:text-night-text hover:underline">
                      Участник
                      {sortIndicator("name")}
                    </a>
                  </th>
                  <th className="px-3 py-2 font-semibold">
                    <a href={sortHref("date")} className="hover:text-night-text hover:underline">
                      Дата регистрации
                      {sortIndicator("date")}
                    </a>
                  </th>
                  <th className="px-3 py-2 font-semibold">Статус</th>
                  <th className="px-3 py-2 font-semibold">
                    <a href={sortHref("paid")} className="hover:text-night-text hover:underline">
                      Оплата
                      {sortIndicator("paid")}
                    </a>
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((r) => (
                  <tr key={r.id} className="border-t border-admin-border hover:bg-admin-card2/50">
                    <td className="px-3 py-2 align-top font-medium text-night-text">{r.dancer.displayName}</td>
                    <td className="px-3 py-2 align-top tabular-nums text-admin-muted">{formatDateTime(r.createdAt)}</td>
                    <td className="px-3 py-2 align-top">
                      <EventRegistrationStatusSelect eventSlug={event.slug} registrationId={r.id} status={r.status} />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <EventRegistrationPaymentToggle eventSlug={event.slug} registrationId={r.id} isPaid={r.isPaid} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile — карточки вместо широкой таблицы, тот же паттерн, что и ParticipantsPanel. */}
          <div className="flex flex-col gap-2 sm:hidden">
            {result.items.map((r) => (
              <div key={r.id} className="rounded-app-sm border border-admin-border bg-admin-card p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="m-0 font-medium text-night-text">{r.dancer.displayName}</p>
                  <EventRegistrationPaymentToggle eventSlug={event.slug} registrationId={r.id} isPaid={r.isPaid} />
                </div>
                <p className="m-0 mt-1 text-xs text-admin-muted">{formatDateTime(r.createdAt)}</p>
                <div className="mt-2">
                  <EventRegistrationStatusSelect eventSlug={event.slug} registrationId={r.id} status={r.status} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {totalPages > 1 && (
        <div className="flex items-center gap-3 text-sm text-admin-muted">
          {page > 1 && (
            <a href={buildHref(basePath, currentFilterParams, { page: String(page - 1) })} className="hover:text-night-text hover:underline">
              ← Назад
            </a>
          )}
          <span>
            Страница {page} из {totalPages}
          </span>
          {page < totalPages && (
            <a href={buildHref(basePath, currentFilterParams, { page: String(page + 1) })} className="hover:text-night-text hover:underline">
              Вперёд →
            </a>
          )}
        </div>
      )}
    </div>
  );
}
