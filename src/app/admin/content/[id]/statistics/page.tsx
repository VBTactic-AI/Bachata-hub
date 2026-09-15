import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getEventRegistrationStatistics } from "@/server/events/registration-statistics";
import { RegistrationForbiddenError } from "@/server/events/registration-service";
import { EVENT_REGISTRATION_STATUS_LABELS, EVENT_REGISTRATION_STATUS_VALUES } from "@/lib/events/event-type-registry";
import { formatEventDate } from "@/lib/format";

// §19 ТЗ (Event Statistics) — полноценное представление вместо 4 инлайн-
// плиток "Обзора" (StatCard там остаётся — это разные вещи: "Обзор" даёт
// быстрый вход в фильтр "Участников", здесь — анализ структуры и динамики).
// Доступ — тот же hasEventAccess, что и у "Обзора"/"Участников" (проверен в
// layout.tsx рядом, здесь — повторно внутри getEventRegistrationStatistics,
// то же defense-in-depth, что и на остальных вкладках).

function Bar({ label, count, total, tone = "primary" }: { label: string; count: number; total: number; tone?: "primary" | "success" | "danger" }) {
  const pct = total === 0 ? 0 : Math.round((count / total) * 100);
  const barColor = tone === "success" ? "bg-night-success" : tone === "danger" ? "bg-red-400" : "bg-admin-primary";
  return (
    <div className="flex items-center gap-3">
      <span className="w-36 shrink-0 text-sm text-admin-muted">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-admin-card2">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-20 shrink-0 text-right text-sm font-semibold tabular-nums text-night-text">
        {count} ({pct}%)
      </span>
    </div>
  );
}

export default async function EventStatisticsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  let stats;
  try {
    stats = await getEventRegistrationStatistics(id, user);
  } catch (e) {
    if (e instanceof RegistrationForbiddenError) redirect("/admin/content");
    throw e;
  }

  const notPaidCount = stats.totalOverall - stats.paidCount;
  const maxDayCount = Math.max(1, ...stats.registrationsByDay.map((d) => d.count));

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-app border border-admin-border bg-admin-card p-4">
        <h2 className="m-0 mb-3 text-sm font-semibold uppercase tracking-wide text-admin-muted">Воронка по статусам</h2>
        {stats.totalOverall === 0 ? (
          <p className="m-0 text-sm text-admin-muted">Пока никто не зарегистрировался.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {EVENT_REGISTRATION_STATUS_VALUES.map((s) => (
              <Bar key={s} label={EVENT_REGISTRATION_STATUS_LABELS[s]} count={stats.byStatus[s]} total={stats.totalOverall} />
            ))}
          </div>
        )}
      </div>

      <div className="rounded-app border border-admin-border bg-admin-card p-4">
        <h2 className="m-0 mb-3 text-sm font-semibold uppercase tracking-wide text-admin-muted">Оплата</h2>
        {stats.totalOverall === 0 ? (
          <p className="m-0 text-sm text-admin-muted">Пока никто не зарегистрировался.</p>
        ) : (
          <div className="flex flex-col gap-2">
            <Bar label="Оплачено" count={stats.paidCount} total={stats.totalOverall} tone="success" />
            <Bar label="Не оплачено" count={notPaidCount} total={stats.totalOverall} tone="danger" />
          </div>
        )}
      </div>

      <div className="rounded-app border border-admin-border bg-admin-card p-4">
        <h2 className="m-0 mb-1 text-sm font-semibold uppercase tracking-wide text-admin-muted">Неявка</h2>
        {stats.noShowRate === null ? (
          <p className="m-0 text-sm text-admin-muted">Пока нет ни одного участника с подтверждённым местом.</p>
        ) : (
          <>
            <p className="m-0 text-2xl font-extrabold text-night-text">{Math.round(stats.noShowRate * 100)}%</p>
            <p className="m-0 mt-1 text-xs text-admin-muted">
              {stats.byStatus.NO_SHOW} из {stats.byStatus.REGISTERED + stats.byStatus.CONFIRMED + stats.byStatus.NO_SHOW} человек, у которых было
              подтверждённое место (зарегистрирован/подтверждён/не пришёл) — организатор отметил как "не пришёл". Не считает тех, кто был в листе
              ожидания, отклонён или отменил регистрацию сам — у них не было шанса прийти.
            </p>
          </>
        )}
      </div>

      <div className="rounded-app border border-admin-border bg-admin-card p-4">
        <h2 className="m-0 mb-3 text-sm font-semibold uppercase tracking-wide text-admin-muted">Регистрации по дням</h2>
        {stats.registrationsByDay.length === 0 ? (
          <p className="m-0 text-sm text-admin-muted">Пока никто не зарегистрировался.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {stats.registrationsByDay.map((d) => (
              <div key={d.date} className="flex items-center gap-3">
                <span className="w-28 shrink-0 text-sm tabular-nums text-admin-muted">{formatEventDate(new Date(d.date))}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-admin-card2">
                  <div className="h-full rounded-full bg-admin-primary" style={{ width: `${(d.count / maxDayCount) * 100}%` }} />
                </div>
                <span className="w-10 shrink-0 text-right text-sm font-semibold tabular-nums text-night-text">{d.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
