import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listEventRegistrations, RegistrationForbiddenError } from "@/server/events/registration-service";
import { EventRegistrationStatusSelect } from "@/components/admin/events/EventRegistrationStatusSelect";
import { EventRegistrationPaymentToggle } from "@/components/admin/events/EventRegistrationPaymentToggle";
import { StatCard } from "@/components/admin/StatCard";
import { PeopleIcon, CardIcon, AlertIcon } from "@/components/admin/icons";
import { formatDateTime } from "@/lib/format";

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
export default async function EventRegistrationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id } = await params;
  const { page: pageParam } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const event = await prisma.event.findUnique({
    where: { id },
    select: { id: true, slug: true, title: true, capacity: true, registrationEnabled: true },
  });
  if (!event) notFound();

  const page = Math.max(Number(pageParam) || 1, 1);
  let result;
  try {
    result = await listEventRegistrations(event.id, user, { page, pageSize: 50 });
  } catch (e) {
    if (e instanceof RegistrationForbiddenError) redirect("/admin/content");
    throw e;
  }

  const totalPages = Math.max(Math.ceil(result.total / result.pageSize), 1);
  const pct = (count: number) => (result.total === 0 ? 0 : Math.round((count / result.total) * 100));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <a href="/admin/content" className="text-sm text-admin-muted hover:text-night-text hover:underline">
          ← К моим событиям
        </a>
        <h1 className="m-0 mt-1 font-night text-xl font-extrabold text-night-text sm:text-2xl">Участники — {event.title}</h1>
        {!event.registrationEnabled && (
          <p className="m-0 mt-1 text-sm text-admin-muted">Регистрация на событии сейчас выключена в настройках мастера.</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Всего регистраций" value={result.total} icon={<PeopleIcon />} tone="primary" />
        <StatCard label="Оплачено" value={result.paidCount} icon={<CardIcon />} tone="success" percent={pct(result.paidCount)} />
        <StatCard label="Не оплачено" value={result.total - result.paidCount} icon={<AlertIcon />} tone="danger" percent={pct(result.total - result.paidCount)} />
        <StatCard
          label="Лист ожидания"
          value={result.waitlistCount}
          icon={<PeopleIcon />}
          tone="primary"
          percent={pct(result.waitlistCount)}
        />
      </div>

      {result.items.length === 0 ? (
        <p className="text-sm text-admin-muted">Пока никто не зарегистрировался.</p>
      ) : (
        <>
          {/* Desktop/tablet — компактная таблица, тот же стиль, что и ParticipantsPanel. */}
          <div className="hidden overflow-x-auto rounded-app border border-admin-border sm:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-admin-card2 text-xs font-semibold uppercase tracking-wide text-admin-disabled">
                <tr>
                  <th className="px-3 py-2 font-semibold">Участник</th>
                  <th className="px-3 py-2 font-semibold">Дата регистрации</th>
                  <th className="px-3 py-2 font-semibold">Статус</th>
                  <th className="px-3 py-2 font-semibold">Оплата</th>
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
            <a href={`/admin/content/${event.id}/registrations?page=${page - 1}`} className="hover:text-night-text hover:underline">
              ← Назад
            </a>
          )}
          <span>
            Страница {page} из {totalPages}
          </span>
          {page < totalPages && (
            <a href={`/admin/content/${event.id}/registrations?page=${page + 1}`} className="hover:text-night-text hover:underline">
              Вперёд →
            </a>
          )}
        </div>
      )}
    </div>
  );
}
