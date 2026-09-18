import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getEventRegistrationStatistics } from "@/server/events/registration-statistics";
import { getTicketDistributionForEvent } from "@/server/events/event-statistics";
import { listOrdersForEvent } from "@/server/events/order-service";
import { listDoorSalesForEvent } from "@/server/events/door-sale-service";
import { RegistrationForbiddenError } from "@/server/events/registration-service";
import { EVENT_REGISTRATION_STATUS_LABELS, EVENT_REGISTRATION_STATUS_VALUES } from "@/lib/events/event-type-registry";
import { DonutChart, HorizontalBarChart, VerticalBarChart, RadialProgress } from "@/components/admin/charts/StatCharts";

// §19 ТЗ (Event Statistics) — полноценное представление вместо 4 инлайн-
// плиток "Обзора" (StatCard там остаётся — это разные вещи: "Обзор" даёт
// быстрый вход в фильтр "Участников", здесь — анализ структуры и динамики).
// Доступ — тот же hasEventAccess, что и у "Обзора"/"Участников" (проверен в
// layout.tsx рядом, здесь — повторно внутри getEventRegistrationStatistics,
// то же defense-in-depth, что и на остальных вкладках).
//
// Графики (2026-09-18, по прямому запросу пользователя — "некрасивые
// полоски" заменены на донат/бар/кольцо-чарты, см. StatCharts.tsx) —
// "Нал/Безнал" отдельно, isOwnerOrAdmin (тот же уровень доступа, что и
// вкладка "Заказы" — это финансовая детализация, не просто счётчик):
// listOrdersForEvent/listDoorSalesForEvent брошены в try/catch, при
// RegistrationForbiddenError блок просто не рендерится, а не рушит всю
// страницу — остальная статистика (hasEventAccess) видна любому члену
// команды события.

function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default async function EventStatisticsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  let stats;
  let ticketDistribution;
  try {
    [stats, ticketDistribution] = await Promise.all([getEventRegistrationStatistics(id, user), getTicketDistributionForEvent(id, user)]);
  } catch (e) {
    if (e instanceof RegistrationForbiddenError) redirect("/admin/content");
    throw e;
  }

  // Нал/безнал — только для владельца/ADMIN (см. комментарий выше). Чистая
  // выручка по методу — тот же расчёт, что и на вкладке "Заказы"
  // (orders/page.tsx): total заказа минус завершённые возвраты, метод берём
  // с последнего Payment; DoorSale всегда полностью оплачена своим методом
  // в момент создания.
  let paymentSplit: { cash: number; transfer: number; unspecified: number; currency: string } | null = null;
  try {
    const [orders, doorSales] = await Promise.all([listOrdersForEvent(id, user), listDoorSalesForEvent(id, user)]);
    let cash = 0;
    let transfer = 0;
    let unspecified = 0;
    let currency = "BYN";
    for (const o of orders) {
      if (o.status === "PENDING" || o.status === "CANCELLED") continue;
      const refundedTotal = o.refunds.filter((r) => r.status === "COMPLETED").reduce((sum, r) => sum + Number(r.amount), 0);
      const net = Number(o.total) - refundedTotal;
      if (net <= 0) continue;
      if (o.currency) currency = o.currency;
      const method = o.payments[0]?.method ?? null;
      if (method === "CASH") cash += net;
      else if (method === "TRANSFER") transfer += net;
      else unspecified += net;
    }
    for (const s of doorSales) {
      if (s.currency) currency = s.currency;
      if (s.method === "CASH") cash += Number(s.amount);
      else transfer += Number(s.amount);
    }
    paymentSplit = { cash, transfer, unspecified, currency };
  } catch (e) {
    if (!(e instanceof RegistrationForbiddenError)) throw e;
  }

  const notPaidCount = stats.totalOverall - stats.paidCount;
  const totalTickets = ticketDistribution.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-app border border-admin-border bg-admin-card p-4">
          <h2 className="m-0 mb-3 text-sm font-semibold uppercase tracking-wide text-admin-muted">Распределение по билетам</h2>
          {totalTickets === 0 ? (
            <p className="m-0 text-sm text-admin-muted">Пока не выдано ни одного билета.</p>
          ) : (
            <DonutChart
              segments={ticketDistribution.map((d) => ({ label: d.name, value: d.count }))}
              centerLabel={totalTickets}
              centerSubLabel="билетов"
            />
          )}
        </div>

        <div className="rounded-app border border-admin-border bg-admin-card p-4">
          <h2 className="m-0 mb-3 text-sm font-semibold uppercase tracking-wide text-admin-muted">Оплата</h2>
          {stats.totalOverall === 0 ? (
            <p className="m-0 text-sm text-admin-muted">Пока никто не зарегистрировался.</p>
          ) : (
            <DonutChart
              segments={[
                { label: "Оплачено", value: stats.paidCount, color: "#37d67a" },
                { label: "Не оплачено", value: notPaidCount, color: "#ff2d8a" },
              ]}
              centerLabel={stats.totalOverall}
              centerSubLabel="участников"
            />
          )}
        </div>
      </div>

      {paymentSplit && (paymentSplit.cash > 0 || paymentSplit.transfer > 0 || paymentSplit.unspecified > 0) && (
        <div className="rounded-app border border-admin-border bg-admin-card p-4">
          <h2 className="m-0 mb-3 text-sm font-semibold uppercase tracking-wide text-admin-muted">Наличные / Б/н</h2>
          <DonutChart
            segments={[
              { label: "Наличные", value: paymentSplit.cash, color: "#37d67a" },
              { label: "Б/н (перевод)", value: paymentSplit.transfer, color: "#a78bfa" },
              ...(paymentSplit.unspecified > 0 ? [{ label: "Способ не указан", value: paymentSplit.unspecified, color: "#94a3b8" }] : []),
            ]}
            centerLabel={`${paymentSplit.cash + paymentSplit.transfer + paymentSplit.unspecified}`}
            centerSubLabel={paymentSplit.currency}
          />
        </div>
      )}

      <div className="rounded-app border border-admin-border bg-admin-card p-4">
        <h2 className="m-0 mb-3 text-sm font-semibold uppercase tracking-wide text-admin-muted">Воронка по статусам</h2>
        {stats.totalOverall === 0 ? (
          <p className="m-0 text-sm text-admin-muted">Пока никто не зарегистрировался.</p>
        ) : (
          <HorizontalBarChart
            items={EVENT_REGISTRATION_STATUS_VALUES.map((s) => ({ label: EVENT_REGISTRATION_STATUS_LABELS[s], value: stats.byStatus[s] }))}
            maxValue={stats.totalOverall}
          />
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[auto_1fr]">
        <div className="rounded-app border border-admin-border bg-admin-card p-4">
          <h2 className="m-0 mb-3 text-sm font-semibold uppercase tracking-wide text-admin-muted">Неявка</h2>
          {stats.noShowRate === null ? (
            <p className="m-0 max-w-[240px] text-sm text-admin-muted">Пока нет ни одного участника с подтверждённым местом.</p>
          ) : (
            <div className="flex items-center gap-4">
              <RadialProgress percent={Math.round(stats.noShowRate * 100)} color="#ff2d8a" />
              <p className="m-0 max-w-[220px] text-xs text-admin-muted">
                {stats.byStatus.NO_SHOW} из {stats.byStatus.REGISTERED + stats.byStatus.CONFIRMED + stats.byStatus.NO_SHOW} человек с подтверждённым
                местом отмечены как "не пришёл".
              </p>
            </div>
          )}
        </div>

        <div className="rounded-app border border-admin-border bg-admin-card p-4">
          <h2 className="m-0 mb-3 text-sm font-semibold uppercase tracking-wide text-admin-muted">Регистрации по дням</h2>
          {stats.registrationsByDay.length === 0 ? (
            <p className="m-0 text-sm text-admin-muted">Пока никто не зарегистрировался.</p>
          ) : (
            <VerticalBarChart items={stats.registrationsByDay.map((d) => ({ label: shortDate(d.date), value: d.count }))} />
          )}
        </div>
      </div>
    </div>
  );
}
