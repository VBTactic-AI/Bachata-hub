import { StatusBadge, type StatusBadgeVariant } from "@/components/admin/StatusBadge";

// Commerce Engine v1 (2026-09-17) — витрина Order/Payment/Refund, только
// чтение (§32 задачи "Admin Commerce → Orders"). Мутации сюда НЕ ведут —
// Order/Payment/Refund создаются исключительно ticket-service.ts
// (issueTicket/issueTicketForType/cancelTicket/refundTicket), эта таблица —
// просто отображение уже произошедшего.

export type OrderRow = {
  id: string;
  createdAt: string;
  status: string;
  currency: string | null;
  total: number;
  discount: number;
  dancerName: string;
  itemNames: string[];
  promoCode: string | null;
  referralCode: string | null;
  paymentStatus: string | null;
  paymentMethod: string | null;
  refundedTotal: number;
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "Наличные",
  TRANSFER: "Б/н (перевод)",
};

const ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING: "Ожидает оплаты",
  PAID: "Оплачен",
  PARTIALLY_REFUNDED: "Частично возвращён",
  REFUNDED: "Возвращён",
  CANCELLED: "Отменён",
};

const ORDER_STATUS_VARIANTS: Record<string, StatusBadgeVariant> = {
  PENDING: "neutral",
  PAID: "success",
  PARTIALLY_REFUNDED: "warning",
  REFUNDED: "danger",
  CANCELLED: "neutral",
};

function formatAmount(amount: number, currency: string | null): string {
  return currency ? `${amount} ${currency}` : `${amount}`;
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso)
  );
}

export function OrdersTable({ orders }: { orders: OrderRow[] }) {
  if (orders.length === 0) {
    return <p className="m-0 text-sm text-admin-muted">Заказов пока нет.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-app border border-admin-border">
      <table className="w-full text-left text-sm">
        <thead className="bg-admin-card2 text-xs font-semibold uppercase tracking-wide text-admin-disabled">
          <tr>
            <th className="px-3 py-2.5 font-semibold">Дата</th>
            <th className="px-3 py-2.5 font-semibold">Покупатель</th>
            <th className="px-3 py-2.5 font-semibold">Товар</th>
            <th className="px-3 py-2.5 font-semibold">Сумма</th>
            <th className="px-3 py-2.5 font-semibold">Оплата</th>
            <th className="px-3 py-2.5 font-semibold">Статус заказа</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id} className="border-t border-admin-border">
              <td className="px-3 py-3 align-middle whitespace-nowrap text-admin-muted">{formatDate(o.createdAt)}</td>
              <td className="px-3 py-3 align-middle font-medium text-night-text">{o.dancerName}</td>
              <td className="px-3 py-3 align-middle text-admin-muted">
                <span className="max-w-[220px] truncate">{o.itemNames.join(", ") || "—"}</span>
                {(o.promoCode || o.referralCode) && (
                  <div className="mt-0.5 text-xs text-admin-disabled">
                    {o.promoCode && <span>промокод {o.promoCode}</span>}
                    {o.promoCode && o.referralCode && " · "}
                    {o.referralCode && <span>реферальный код {o.referralCode}</span>}
                  </div>
                )}
              </td>
              <td className="px-3 py-3 align-middle tabular-nums text-night-text">
                {formatAmount(o.total, o.currency)}
                {o.discount > 0 && <div className="text-xs text-admin-disabled">скидка {formatAmount(o.discount, o.currency)}</div>}
                {o.refundedTotal > 0 && <div className="text-xs text-red-400">возвращено {formatAmount(o.refundedTotal, o.currency)}</div>}
              </td>
              <td className="px-3 py-3 align-middle text-admin-muted">
                {o.paymentStatus === "PAID"
                  ? (o.paymentMethod ? PAYMENT_METHOD_LABELS[o.paymentMethod] : null) ?? "Оплачено (способ не указан)"
                  : o.paymentStatus
                    ? "Ожидается"
                    : "—"}
              </td>
              <td className="px-3 py-3 align-middle">
                <StatusBadge label={ORDER_STATUS_LABELS[o.status] ?? o.status} variant={ORDER_STATUS_VARIANTS[o.status] ?? "neutral"} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
