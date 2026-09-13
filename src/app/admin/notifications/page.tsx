import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/admin/StatCard";
import { AlertIcon, CheckCircleIcon } from "@/components/admin/icons";
import { formatTimeAgo } from "@/lib/format";
import {
  getSubscriptionOverview,
  getChannelUsageOverview,
  getNotificationVolumeOverview,
  getDeliveryStats,
  getEstimatedCost,
  listFailedDeliveries,
  listFailedJobs,
} from "@/server/notifications/control-center";
import { listBroadcastHistory } from "@/server/notifications/broadcast";
import { ChannelPriceRow } from "@/components/admin/notifications/ChannelPriceRow";
import { RetryButton } from "@/components/admin/notifications/RetryButton";
import { BroadcastComposer } from "@/components/admin/notifications/BroadcastComposer";
import { CHANNEL_LABELS } from "@/lib/notifications/channel-labels";

// Subscription & Notification Control Center (2026-09-13) — сводная админ-
// страница поверх Notification & Subscription Engine (Phase 0-8) и Phase 9
// её же плана (статистика доставки/failed deliveries). Доступ — тот же
// isAdmin, что у "База данных"/"Модерация": инфраструктурная сводка по всей
// платформе, не завязана на конкретное соревнование/дивизион.

const SUBSCRIPTION_TYPE_LABELS: Record<string, string> = {
  EVENT: "Конкретные события",
  SCHOOL: "Школы",
  CITY: "Города",
  COUNTRY: "Страны",
  EVENT_TYPE: "Типы событий",
  INSTRUCTOR: "Преподаватели",
};

const PERIODS = [7, 30, 90] as const;

export default async function NotificationsControlCenterPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isAdmin(user)) redirect("/admin");

  const sp = await searchParams;
  const requestedDays = Number(sp.days);
  const days = (PERIODS as readonly number[]).includes(requestedDays) ? requestedDays : 30;

  const [subscriptionOverview, channelUsage, volume, deliveryStats, cost, failedDeliveries, failedJobs, broadcastHistory] = await Promise.all([
    getSubscriptionOverview(),
    getChannelUsageOverview(),
    getNotificationVolumeOverview(days),
    getDeliveryStats(days),
    getEstimatedCost(days),
    listFailedDeliveries({ limit: 20 }),
    listFailedJobs({ limit: 20 }),
    listBroadcastHistory(10),
  ]);

  const totalFailedDeliveries = deliveryStats.reduce((sum, s) => sum + s.failedCount, 0);
  const totalCostLine = Object.entries(cost.totalByCurrency)
    .map(([currency, amount]) => `${amount.toFixed(2)} ${currency}`)
    .join(" + ");

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="m-0 font-night text-xl font-extrabold text-night-text sm:text-2xl">Оповещения</h1>
        <p className="m-0 mt-1 text-sm text-admin-muted">
          Кто на что подписан, какие каналы используются, сколько уведомлений отправляется и сколько это стоит по оценке.
        </p>
      </div>

      <Card className="flex flex-col gap-3 border-admin-border bg-admin-card">
        <h2 className="m-0 font-night text-base font-bold text-night-text">Новая рассылка</h2>
        <BroadcastComposer />
      </Card>

      {broadcastHistory.length > 0 && (
        <Card className="flex flex-col gap-3 border-admin-border bg-admin-card">
          <h2 className="m-0 font-night text-base font-bold text-night-text">История рассылок</h2>
          <div className="flex flex-col gap-2">
            {broadcastHistory.map((b) => (
              <div key={b.id} className="rounded-app-sm border border-admin-border bg-admin-card2 p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="m-0 text-sm font-semibold text-night-text">{b.title}</p>
                  <p className="m-0 text-xs text-admin-disabled">{formatTimeAgo(b.createdAt)}</p>
                </div>
                <p className="m-0 mt-1 text-xs text-admin-muted">{b.body}</p>
                <p className="m-0 mt-1.5 text-xs text-admin-disabled">
                  {b.targetType ? `${SUBSCRIPTION_TYPE_LABELS[b.targetType] ?? b.targetType}: ${b.targetLabel}` : "Все пользователи"} ·{" "}
                  {b.recipientCount} получателей · отправил {b.sentByEmail}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="flex items-center gap-2">
        {PERIODS.map((p) => (
          <Link
            key={p}
            href={`/admin/notifications?days=${p}`}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold no-underline transition-colors hover:no-underline ${
              p === days ? "bg-admin-primary/15 text-admin-primaryHover" : "text-admin-muted hover:bg-admin-card2"
            }`}
          >
            {p} дней
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Подписчиков" value={subscriptionOverview.totalSubscribers} />
        <StatCard label="Подписок всего" value={subscriptionOverview.totalSubscriptions} />
        <StatCard label={`Уведомлений за ${days} дн.`} value={volume.total} />
        <StatCard
          label="Ошибок доставки"
          value={totalFailedDeliveries}
          icon={totalFailedDeliveries > 0 ? <AlertIcon /> : <CheckCircleIcon />}
          tone={totalFailedDeliveries > 0 ? "danger" : "success"}
        />
      </div>

      <Card className="flex flex-col gap-3 border-admin-border bg-admin-card">
        <h2 className="m-0 font-night text-base font-bold text-night-text">Подписки — кто на что подписан</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {subscriptionOverview.byType.map((b) => (
            <div key={b.type} className="rounded-app-sm border border-admin-border bg-admin-card2 p-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="m-0 text-sm font-semibold text-night-text">{SUBSCRIPTION_TYPE_LABELS[b.type] ?? b.type}</p>
                <p className="m-0 whitespace-nowrap text-xs text-admin-muted">
                  {b.subscriptionsCount} · {b.uniqueTargetsCount} целей
                </p>
              </div>
              {b.topTargets.length > 0 ? (
                <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0">
                  {b.topTargets.map((target) => (
                    <li key={target.targetId} className="flex items-center justify-between gap-2 text-xs text-admin-muted">
                      <span className="truncate">{target.label}</span>
                      <span className="shrink-0 font-semibold text-night-text">{target.subscribersCount}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="m-0 mt-2 text-xs text-admin-disabled">Подписок нет.</p>
              )}
            </div>
          ))}
        </div>
      </Card>

      <Card className="flex flex-col gap-3 border-admin-border bg-admin-card">
        <h2 className="m-0 font-night text-base font-bold text-night-text">Каналы</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-admin-disabled">
                <th className="pb-2 pr-3 font-medium">Канал</th>
                <th className="pb-2 pr-3 font-medium">Включили в настройках</th>
                <th className="pb-2 pr-3 font-medium">Активных подписок устройства</th>
                <th className="pb-2 font-medium">Провайдер</th>
              </tr>
            </thead>
            <tbody>
              {channelUsage.map((c) => (
                <tr key={c.channel} className="border-t border-admin-border">
                  <td className="py-2 pr-3 font-medium text-night-text">{CHANNEL_LABELS[c.channel]}</td>
                  <td className="py-2 pr-3 text-admin-muted">{c.usersEnabledCount}</td>
                  <td className="py-2 pr-3 text-admin-muted">{c.activeEndpointsCount ?? "—"}</td>
                  <td className="py-2">
                    {c.providerConfigured === null ? (
                      <span className="text-admin-disabled">—</span>
                    ) : c.providerConfigured ? (
                      <span className="text-night-success">Настроен</span>
                    ) : (
                      <span className="text-red-400">Не настроен</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="flex flex-col gap-3 border-admin-border bg-admin-card">
        <h2 className="m-0 font-night text-base font-bold text-night-text">Объём уведомлений за {days} дн.</h2>
        {volume.byType.length === 0 ? (
          <p className="m-0 text-sm text-admin-disabled">За выбранный период уведомлений не было.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
            {volume.byType.map((v) => (
              <li key={v.type} className="flex items-center justify-between gap-2 border-t border-admin-border py-1.5 first:border-t-0">
                <span className="text-night-text">{v.type}</span>
                <span className="font-semibold text-night-text">{v.count}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="flex flex-col gap-3 border-admin-border bg-admin-card">
        <h2 className="m-0 font-night text-base font-bold text-night-text">Доставка за {days} дн.</h2>
        {deliveryStats.every((s) => s.total === 0) ? (
          <p className="m-0 text-sm text-admin-disabled">За выбранный период доставок не было.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-admin-disabled">
                  <th className="pb-2 pr-3 font-medium">Канал</th>
                  <th className="pb-2 pr-3 font-medium">Всего</th>
                  <th className="pb-2 pr-3 font-medium">Успешно</th>
                  <th className="pb-2 pr-3 font-medium">Ошибки</th>
                  <th className="pb-2 font-medium">% успеха</th>
                </tr>
              </thead>
              <tbody>
                {deliveryStats
                  .filter((s) => s.total > 0)
                  .map((s) => (
                    <tr key={s.channel} className="border-t border-admin-border">
                      <td className="py-2 pr-3 font-medium text-night-text">{CHANNEL_LABELS[s.channel]}</td>
                      <td className="py-2 pr-3 text-admin-muted">{s.total}</td>
                      <td className="py-2 pr-3 text-night-success">{s.successCount}</td>
                      <td className="py-2 pr-3 text-red-400">{s.failedCount}</td>
                      <td className="py-2 text-admin-muted">{s.successRatePercent === null ? "—" : `${s.successRatePercent}%`}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="flex flex-col gap-3 border-admin-border bg-admin-card">
        <div>
          <h2 className="m-0 font-night text-base font-bold text-night-text">Оценка стоимости за {days} дн.</h2>
          <p className="m-0 mt-1 text-xs text-admin-disabled">
            Это ОЦЕНКА (успешные доставки × введённая ниже цена за 1000), не реальный счёт провайдера — ни Resend, ни Web
            Push/Telegram не дают API с фактическим биллингом конкретной рассылки. В приложении (IN_APP) доставка ничего не
            стоит и здесь не показана.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-admin-disabled">
                <th className="pb-2 pr-3 font-medium">Канал</th>
                <th className="pb-2 pr-3 font-medium">Отправлено успешно</th>
                <th className="pb-2 pr-3 font-medium">Цена за 1000</th>
                <th className="pb-2 font-medium">Оценка</th>
              </tr>
            </thead>
            <tbody>
              {cost.rows.map((r) => (
                <ChannelPriceRow
                  key={r.channel}
                  channel={r.channel}
                  pricePerThousand={r.pricePerThousand}
                  currency={r.currency}
                  sentCount={r.sentCount}
                  cost={r.cost}
                />
              ))}
            </tbody>
            {totalCostLine && (
              <tfoot>
                <tr className="border-t border-admin-border">
                  <td colSpan={3} className="pt-2 text-right text-sm font-semibold text-night-text">
                    Итого (оценка):
                  </td>
                  <td className="pt-2 text-sm font-bold text-night-text">{totalCostLine}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>

      <Card className="flex flex-col gap-3 border-admin-border bg-admin-card">
        <h2 className="m-0 font-night text-base font-bold text-night-text">Проблемы доставки</h2>
        {failedDeliveries.rows.length === 0 ? (
          <p className="m-0 text-sm text-night-success">Упавших доставок нет.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {failedDeliveries.rows.map((d) => (
              <div key={d.id} className="flex flex-col gap-2 rounded-app-sm border border-admin-border bg-admin-card2 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="m-0 truncate text-sm font-semibold text-night-text">
                    {CHANNEL_LABELS[d.channel]} · {d.title}
                  </p>
                  <p className="m-0 mt-0.5 truncate text-xs text-admin-muted">{d.userEmail}</p>
                  <p className="m-0 mt-0.5 text-xs text-red-400">
                    {d.errorCode ? `[${d.errorCode}] ` : ""}
                    {d.errorMessage ?? "Причина не указана"}
                  </p>
                  <p className="m-0 mt-0.5 text-xs text-admin-disabled">
                    Попыток: {d.attemptCount}
                    {d.lastAttemptAt ? ` · последняя ${formatTimeAgo(d.lastAttemptAt)}` : ""}
                  </p>
                </div>
                <RetryButton endpoint={`/api/admin/notifications/deliveries/${d.id}/retry`} />
              </div>
            ))}
          </div>
        )}

        {failedJobs.rows.length > 0 && (
          <div className="mt-2 flex flex-col gap-2 border-t border-admin-border pt-3">
            <p className="m-0 text-sm font-semibold text-night-text">Упавшие задания рассылки (до определения получателей)</p>
            {failedJobs.rows.map((j) => (
              <div key={j.id} className="flex flex-col gap-2 rounded-app-sm border border-admin-border bg-admin-card2 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="m-0 text-sm font-semibold text-night-text">{j.eventType}</p>
                  <p className="m-0 mt-0.5 text-xs text-red-400">{j.errorMessage ?? "Причина не указана"}</p>
                  <p className="m-0 mt-0.5 text-xs text-admin-disabled">
                    Попыток: {j.attemptCount}
                    {j.lastAttemptAt ? ` · последняя ${formatTimeAgo(j.lastAttemptAt)}` : ""}
                  </p>
                </div>
                <RetryButton endpoint={`/api/admin/notifications/jobs/${j.id}/retry`} />
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
