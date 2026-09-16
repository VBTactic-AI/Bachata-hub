import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  listEventRegistrations,
  RegistrationForbiddenError,
  type RegistrationSortBy,
  type RegistrationSortDir,
} from "@/server/events/registration-service";
import { listTicketsByDancerForEvent, getEventPaymentSummaryCounts, findFestivalPassForEvent } from "@/server/events/ticket-service";
import { EventRegistrationStatusSelect } from "@/components/admin/events/EventRegistrationStatusSelect";
import { TicketPaymentCell, type FestivalPassMatch } from "@/components/admin/events/TicketPaymentCell";
import { EventRegistrationCheckInToggle } from "@/components/admin/events/EventRegistrationCheckInToggle";
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
//
// Оплата (2026-09-16, Ticket Engine) — больше не поле EventRegistration
// (см. ticket-service.ts). "Оплата"/"Билеты"-фильтр и сортировка по оплате
// сознательно убраны из этой server-side формы (агрегат по Ticket не
// выражается простым Prisma where/orderBy без join) — сама колонка оплаты
// осталась, просто больше не фильтрует список (см. docs/PROGRESS.md).

const SORT_VALUES: RegistrationSortBy[] = ["date", "name"];

type SearchParams = { page?: string; q?: string; status?: string; sort?: string; dir?: string; pass?: string };

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
  const sortBy = SORT_VALUES.find((s) => s === sp.sort);
  const sortDir: RegistrationSortDir = sp.dir === "desc" ? "desc" : "asc";

  // Drill-down с вкладки "Билеты" (?pass=<passId>) — сужаем список до тех,
  // кто купил именно этот Pass (см. комментарий у RegistrationFilter.dancerIds).
  let passFilterName: string | null = null;
  let dancerIds: string[] | undefined;
  if (sp.pass) {
    const pass = await prisma.pass.findUnique({ where: { id: sp.pass }, select: { name: true, eventId: true } });
    if (pass && pass.eventId === event.id) {
      passFilterName = pass.name;
      const holders = await prisma.ticket.findMany({ where: { passId: sp.pass, status: "ISSUED" }, select: { dancerId: true } });
      dancerIds = holders.map((h) => h.dancerId);
    }
  }

  let result;
  try {
    result = await listEventRegistrations(event.id, user, { page, pageSize: 50, search: sp.q, status, dancerIds, sortBy, sortDir });
  } catch (e) {
    if (e instanceof RegistrationForbiddenError) redirect("/admin/content");
    throw e;
  }

  // Билеты/оплата (Ticket Engine v2) — hasPassCatalog/hasTicketTypeCatalog
  // решают, показывать ли названия Pass/билета в колонке или просто простой
  // тумблер "Оплата", как раньше. activePasses/activeTicketTypes — те,
  // которые вообще можно выдать танцору прямо отсюда (2026-09-16: без этого
  // soldQuantity никогда не менялось бы — единственный способ создать
  // привязанный Ticket отсюда).
  const [passCount, activePasses, ticketTypeCount, activeTicketTypes, ticketsByDancer, paymentCounts, festivalProgramItem] = await Promise.all([
    prisma.pass.count({ where: { eventId: event.id } }),
    prisma.pass.findMany({ where: { eventId: event.id, status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { sortOrder: "asc" } }),
    prisma.ticketType.count({ where: { eventId: event.id } }),
    prisma.ticketType.findMany({ where: { eventId: event.id, status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { sortOrder: "asc" } }),
    listTicketsByDancerForEvent(
      event.id,
      result.items.map((r) => r.dancerId)
    ),
    getEventPaymentSummaryCounts(
      event.id,
      // Счётчики KPI — по ВСЕМ регистрациям события, не только текущей
      // странице (тот же принцип, что и totalOverall/waitlistCount).
      (
        await prisma.eventRegistration.findMany({ where: { eventId: event.id }, select: { dancerId: true } })
      ).map((r) => r.dancerId)
    ),
    // Этап 3 — дешёвая проверка "является ли это событие пунктом программы
    // какого-то фестиваля" ДО того, как гонять findFestivalPassForEvent по
    // каждому танцору страницы (для подавляющего большинства обычных
    // событий этот запрос вернёт null, и вся festival-pass-логика ниже
    // просто пропускается).
    prisma.programItem.findFirst({ where: { linkedEventId: event.id }, select: { id: true } }),
  ]);
  const hasPassCatalog = passCount > 0;
  const hasTicketTypeCatalog = ticketTypeCount > 0;
  // issueTicket()/issueTicketForType() требуют активную регистрацию
  // (REGISTERED/CONFIRMED/WAITLIST) — тем, кто сам отменился/отклонён/не
  // пришёл, Pass/билет выдать нельзя (см. ticket-service.ts), поэтому им
  // picker не показываем вовсе.
  const ELIGIBLE_FOR_PASS = new Set(["REGISTERED", "CONFIRMED", "WAITLIST"]);

  // Этап 3 — Pass фестиваля на каждого подходящего танцора текущей
  // страницы (только если событие вообще является дочерним, см. проверку
  // выше — иначе пропускаем полностью, без лишних запросов).
  const festivalPassByDancer = new Map<string, FestivalPassMatch>();
  if (festivalProgramItem) {
    await Promise.all(
      result.items
        .filter((r) => ELIGIBLE_FOR_PASS.has(r.status))
        .map(async (r) => {
          const match = await findFestivalPassForEvent(event.id, r.dancerId);
          if (match) festivalPassByDancer.set(r.dancerId, { passId: match.passId, passName: match.passName });
        })
    );
  }

  const totalPages = Math.max(Math.ceil(result.total / result.pageSize), 1);
  const pctOverall = (count: number) => (result.totalOverall === 0 ? 0 : Math.round((count / result.totalOverall) * 100));

  const basePath = `/admin/content/${event.id}/registrations`;
  // "Текущие" параметры фильтра — переносятся во ВСЕ остальные ссылки
  // (пагинация, сортировка, экспорт), чтобы переключение одного не сбрасывало
  // остальные.
  const currentFilterParams = { q: sp.q, status: sp.status, sort: sp.sort, dir: sp.dir, pass: sp.pass };
  const exportHref = buildHref("/api/events/" + event.slug + "/registrations/export", currentFilterParams, {});

  function sortHref(field: RegistrationSortBy) {
    const nextDir = sortBy === field && sortDir === "asc" ? "desc" : "asc";
    return buildHref(basePath, currentFilterParams, { sort: field, dir: nextDir, page: undefined });
  }
  function sortIndicator(field: RegistrationSortBy) {
    if (sortBy !== field) return null;
    return <span aria-hidden="true">{sortDir === "asc" ? " ▲" : " ▼"}</span>;
  }

  const hasActiveFilter = Boolean(sp.q || sp.status || passFilterName);

  const waitlistActive = sp.status === "WAITLIST";
  const totalActive = !hasActiveFilter;

  const totalHref = basePath;
  const waitlistHref = buildHref(basePath, currentFilterParams, { status: waitlistActive ? undefined : "WAITLIST", page: undefined });

  return (
    <div className="flex flex-col gap-4">
      {/* §12 ТЗ — заголовок/бейджи/breadcrumb события теперь общие для всех
          вкладок, рендерятся один раз в layout.tsx рядом. Здесь остаётся
          только специфичное для "Участников" предупреждение. */}
      {!event.registrationEnabled && (
        <p className="m-0 text-sm text-admin-muted">Регистрация на событии сейчас выключена в настройках мастера.</p>
      )}

      {passFilterName && (
        <div className="flex items-center gap-2 rounded-app border border-admin-primary/40 bg-admin-primary/10 px-3 py-2 text-sm text-night-text">
          <span>
            Показаны купившие Pass «<strong>{passFilterName}</strong>»
          </span>
          <a href={buildHref(basePath, currentFilterParams, { pass: undefined, page: undefined })} className="ml-auto text-admin-muted hover:text-night-text hover:underline">
            Сбросить фильтр
          </a>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Всего регистраций" value={result.totalOverall} icon={<PeopleIcon />} tone="primary" href={totalHref} active={totalActive} />
        <StatCard
          label="Оплачено"
          value={paymentCounts.paidCount}
          icon={<CardIcon />}
          tone="success"
          percent={pctOverall(paymentCounts.paidCount)}
        />
        <StatCard
          label="Не оплачено"
          value={paymentCounts.unpaidCount}
          icon={<AlertIcon />}
          tone="danger"
          percent={pctOverall(paymentCounts.unpaidCount)}
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
      {paymentCounts.partialCount > 0 && (
        <p className="m-0 text-xs text-admin-muted">Частично оплачено (не все билеты): {paymentCounts.partialCount}.</p>
      )}

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
                  <th className="px-3 py-2 font-semibold">{hasPassCatalog || hasTicketTypeCatalog ? "Билеты" : "Оплата"}</th>
                  <th className="px-3 py-2 font-semibold">Check-in</th>
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
                      <TicketPaymentCell
                        eventSlug={event.slug}
                        registrationId={r.id}
                        dancerId={r.dancerId}
                        hasPassCatalog={hasPassCatalog}
                        hasTicketTypeCatalog={hasTicketTypeCatalog}
                        initialTickets={ticketsByDancer.get(r.dancerId) ?? []}
                        assignablePasses={ELIGIBLE_FOR_PASS.has(r.status) ? activePasses : []}
                        assignableTicketTypes={ELIGIBLE_FOR_PASS.has(r.status) ? activeTicketTypes : []}
                        festivalPassMatch={festivalPassByDancer.get(r.dancerId) ?? null}
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <EventRegistrationCheckInToggle eventSlug={event.slug} registrationId={r.id} checkedIn={r.checkedInAt != null} />
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
                  <TicketPaymentCell
                    eventSlug={event.slug}
                    registrationId={r.id}
                    dancerId={r.dancerId}
                    hasPassCatalog={hasPassCatalog}
                    hasTicketTypeCatalog={hasTicketTypeCatalog}
                    initialTickets={ticketsByDancer.get(r.dancerId) ?? []}
                    assignablePasses={ELIGIBLE_FOR_PASS.has(r.status) ? activePasses : []}
                    assignableTicketTypes={ELIGIBLE_FOR_PASS.has(r.status) ? activeTicketTypes : []}
                    festivalPassMatch={festivalPassByDancer.get(r.dancerId) ?? null}
                  />
                </div>
                <p className="m-0 mt-1 text-xs text-admin-muted">{formatDateTime(r.createdAt)}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <EventRegistrationStatusSelect eventSlug={event.slug} registrationId={r.id} status={r.status} />
                  <EventRegistrationCheckInToggle eventSlug={event.slug} registrationId={r.id} checkedIn={r.checkedInAt != null} />
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
