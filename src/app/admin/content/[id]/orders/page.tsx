import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listOrdersForEvent } from "@/server/events/order-service";
import { RegistrationForbiddenError, RegistrationNotFoundError } from "@/server/events/registration-service";
import { StatCard } from "@/components/admin/StatCard";
import { CardIcon, PeopleIcon, AlertIcon } from "@/components/admin/icons";
import { OrdersTable, type OrderRow } from "@/components/admin/events/OrdersTable";

// "Заказы" — вкладка Event Dashboard (Commerce Engine v1, 2026-09-17, §32
// задачи "Admin Commerce → Orders/Payments/Refunds"). Только чтение —
// владелец события/ADMIN видит историю Order/Payment/Refund, накопленную
// ticket-service.ts при каждой выдаче/возврате билета (см. order-service.ts).
export default async function EventOrdersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const event = await prisma.event.findUnique({ where: { id }, select: { id: true, slug: true } });
  if (!event) notFound();

  let orders;
  try {
    orders = await listOrdersForEvent(event.id, user);
  } catch (e) {
    if (e instanceof RegistrationForbiddenError) redirect("/admin/content");
    if (e instanceof RegistrationNotFoundError) notFound();
    throw e;
  }

  const rows: OrderRow[] = orders.map((o) => {
    const latestPayment = o.payments[0] ?? null;
    const refundedTotal = o.refunds.filter((r) => r.status === "COMPLETED").reduce((sum, r) => sum + Number(r.amount), 0);
    return {
      id: o.id,
      createdAt: o.createdAt.toISOString(),
      status: o.status,
      currency: o.currency,
      total: Number(o.total),
      discount: Number(o.discount),
      dancerName: o.dancer.displayName,
      itemNames: o.items.map((i) => i.nameSnapshot),
      promoCode: o.promoCode?.code ?? null,
      referralCode: o.referralCode?.code ?? null,
      paymentStatus: latestPayment?.status ?? null,
      refundedTotal,
    };
  });

  const currency = rows.find((r) => r.currency)?.currency ?? "BYN";
  const totalRevenue = rows.reduce((sum, r) => sum + (r.status === "PENDING" || r.status === "CANCELLED" ? 0 : r.total - r.refundedTotal), 0);
  const totalRefunded = rows.reduce((sum, r) => sum + r.refundedTotal, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Заказов" value={rows.length} icon={<PeopleIcon />} tone="primary" />
        <StatCard label="Чистая выручка" value={`${totalRevenue} ${currency}`} icon={<CardIcon />} tone="success" />
        <StatCard label="Возвращено" value={`${totalRefunded} ${currency}`} icon={<AlertIcon />} tone="danger" />
      </div>
      <OrdersTable orders={rows} />
    </div>
  );
}
