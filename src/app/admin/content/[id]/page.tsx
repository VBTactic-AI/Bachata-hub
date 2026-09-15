import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isOwnerOrAdmin } from "@/server/events/access";
import { listEventRegistrations, RegistrationForbiddenError } from "@/server/events/registration-service";
import { getEventPaymentSummaryCounts } from "@/server/events/ticket-service";
import { listTeamMembers } from "@/server/events/team-service";
import { EVENT_TYPE_REGISTRY } from "@/lib/events/event-type-registry";
import { StatCard } from "@/components/admin/StatCard";
import { PeopleIcon, CardIcon, AlertIcon, GearIcon } from "@/components/admin/icons";
import { formatDateTime } from "@/lib/format";

// §12 ТЗ (Event Dashboard) — вкладка "Обзор", дефолтная страница единой
// оболочки события (см. layout.tsx рядом — там же заголовок/бейджи/вкладки
// и общая проверка доступа). Здесь — только сводка: детали события + те же
// KPI, что и на "Участниках" (§11), но кликабельные карточки ведут СРАЗУ на
// вкладку "Участники" с нужным фильтром — Обзор не дублирует список,
// а быстрый переход к нему.
export default async function EventOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const event = await prisma.event.findUnique({
    where: { id },
    include: { city: { select: { nameRu: true } } },
  });
  if (!event) notFound();

  // Доступ уже проверен в layout.tsx (hasEventAccess) — здесь просто читаем
  // данные через те же сервисные функции, что и их собственные вкладки,
  // чтобы не разойтись в цифрах. pageSize:1 — нужны только totalOverall/
  // waitlistCount, не сам список.
  let stats;
  try {
    stats = await listEventRegistrations(event.id, user, { pageSize: 1 });
  } catch (e) {
    if (e instanceof RegistrationForbiddenError) redirect("/admin/content");
    throw e;
  }

  // Оплата (2026-09-16, Ticket Engine) — считается по Ticket, не по
  // EventRegistration (см. ticket-service.ts).
  const allDancerIds = (await prisma.eventRegistration.findMany({ where: { eventId: event.id }, select: { dancerId: true } })).map(
    (r) => r.dancerId
  );
  const paymentCounts = await getEventPaymentSummaryCounts(event.id, allDancerIds);

  const canManage = isOwnerOrAdmin(event, user);
  const teamCount = canManage ? (await listTeamMembers(event.id, user)).length : null;

  const basePath = `/admin/content/${event.id}`;
  const pct = (count: number) => (stats.totalOverall === 0 ? 0 : Math.round((count / stats.totalOverall) * 100));

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-app border border-admin-border bg-admin-card p-4">
        <h2 className="m-0 mb-3 text-sm font-semibold uppercase tracking-wide text-admin-muted">О событии</h2>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-2 sm:justify-start">
            <dt className="text-admin-muted">Формат</dt>
            <dd className="m-0 font-medium text-night-text">{EVENT_TYPE_REGISTRY[event.format].label}</dd>
          </div>
          <div className="flex justify-between gap-2 sm:justify-start">
            <dt className="text-admin-muted">Город</dt>
            <dd className="m-0 font-medium text-night-text">{event.city.nameRu}</dd>
          </div>
          <div className="flex justify-between gap-2 sm:justify-start">
            <dt className="text-admin-muted">Место</dt>
            <dd className="m-0 font-medium text-night-text">{event.venueName}</dd>
          </div>
          <div className="flex justify-between gap-2 sm:justify-start">
            <dt className="text-admin-muted">Начало</dt>
            <dd className="m-0 font-medium text-night-text">{formatDateTime(event.startsAt)}</dd>
          </div>
          {event.endsAt && (
            <div className="flex justify-between gap-2 sm:justify-start">
              <dt className="text-admin-muted">Окончание</dt>
              <dd className="m-0 font-medium text-night-text">{formatDateTime(event.endsAt)}</dd>
            </div>
          )}
          <div className="flex justify-between gap-2 sm:justify-start">
            <dt className="text-admin-muted">Вместимость</dt>
            <dd className="m-0 font-medium text-night-text">{event.capacity ?? "без ограничения"}</dd>
          </div>
          <div className="flex justify-between gap-2 sm:justify-start">
            <dt className="text-admin-muted">Регистрация</dt>
            <dd className="m-0 font-medium text-night-text">{event.registrationEnabled ? "включена" : "выключена"}</dd>
          </div>
        </dl>
      </div>

      <div>
        <h2 className="m-0 mb-2 text-sm font-semibold uppercase tracking-wide text-admin-muted">Участники</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Всего регистраций" value={stats.totalOverall} icon={<PeopleIcon />} tone="primary" href={`${basePath}/registrations`} />
          <StatCard
            label="Оплачено"
            value={paymentCounts.paidCount}
            icon={<CardIcon />}
            tone="success"
            percent={pct(paymentCounts.paidCount)}
            href={`${basePath}/registrations`}
          />
          <StatCard
            label="Не оплачено"
            value={paymentCounts.unpaidCount}
            icon={<AlertIcon />}
            tone="danger"
            percent={pct(paymentCounts.unpaidCount)}
            href={`${basePath}/registrations`}
          />
          <StatCard
            label="Лист ожидания"
            value={stats.waitlistCount}
            icon={<PeopleIcon />}
            tone="primary"
            percent={pct(stats.waitlistCount)}
            href={`${basePath}/registrations?status=WAITLIST`}
          />
        </div>
      </div>

      {canManage && (
        <div>
          <h2 className="m-0 mb-2 text-sm font-semibold uppercase tracking-wide text-admin-muted">Команда</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Участников команды" value={teamCount ?? 0} icon={<GearIcon />} tone="primary" href={`${basePath}/team`} />
          </div>
        </div>
      )}
    </div>
  );
}
