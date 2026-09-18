import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listOrdersForEvent, listProductsForEvent } from "@/server/events/order-service";
import { listDoorSalesForEvent, listSellableProductsForEvent } from "@/server/events/door-sale-service";
import { RegistrationForbiddenError, RegistrationNotFoundError } from "@/server/events/registration-service";
import { StatCard } from "@/components/admin/StatCard";
import { CardIcon, PeopleIcon, AlertIcon } from "@/components/admin/icons";
import { OrdersTable, type OrderRow } from "@/components/admin/events/OrdersTable";
import { DoorSalePanel } from "@/components/admin/events/DoorSalePanel";
import { Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

// "Заказы" — вкладка Event Dashboard (Commerce Engine v1, 2026-09-17, §32
// задачи "Admin Commerce → Orders/Payments/Refunds"). Только чтение —
// владелец события/ADMIN видит историю Order/Payment/Refund, накопленную
// ticket-service.ts при каждой выдаче/возврате билета (см. order-service.ts).
//
// Фильтры по товару и способу оплаты (2026-09-18) — server-side через
// searchParams, тот же паттерн, что и drill-down "?pass=" на вкладке
// "Участники" (registrations/page.tsx).
type SearchParams = { product?: string; method?: string };

function buildHref(basePath: string, current: Record<string, string | undefined>, overrides: Record<string, string | undefined>) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...current, ...overrides })) {
    if (value) qs.set(key, value);
  }
  const s = qs.toString();
  return s ? `${basePath}?${s}` : basePath;
}

export default async function EventOrdersPage({
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

  const event = await prisma.event.findUnique({ where: { id }, select: { id: true, slug: true } });
  if (!event) notFound();

  const paymentMethod = sp.method === "CASH" || sp.method === "TRANSFER" ? sp.method : undefined;

  let orders;
  let products;
  let doorSales;
  let sellableProducts;
  try {
    [orders, products, doorSales, sellableProducts] = await Promise.all([
      listOrdersForEvent(event.id, user, { productId: sp.product, paymentMethod }),
      listProductsForEvent(event.id, user),
      listDoorSalesForEvent(event.id, user),
      listSellableProductsForEvent(event.id, user),
    ]);
  } catch (e) {
    if (e instanceof RegistrationForbiddenError) redirect("/admin/content");
    if (e instanceof RegistrationNotFoundError) notFound();
    throw e;
  }

  const orderRows: OrderRow[] = orders.map((o) => {
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
      paymentMethod: latestPayment?.method ?? null,
      refundedTotal,
    };
  });

  // "Продажа на входе" (2026-09-18) — те же фильтры по товару/способу
  // оплаты, что и у обычных Order выше (sp.product здесь — Product.id, тот
  // же, что и DoorSale.productId, см. door-sale-service.ts).
  const doorSaleRows: OrderRow[] = doorSales
    .filter((s) => !sp.product || s.productId === sp.product)
    .filter((s) => !paymentMethod || s.method === paymentMethod)
    .map((s) => ({
      id: `door:${s.id}`,
      createdAt: s.createdAt.toISOString(),
      status: "PAID",
      currency: s.currency,
      total: Number(s.amount),
      discount: 0,
      dancerName: s.note ? `Без регистрации (${s.note})` : "Без регистрации",
      itemNames: [s.nameSnapshot],
      promoCode: null,
      referralCode: null,
      paymentStatus: "PAID",
      paymentMethod: s.method,
      refundedTotal: 0,
      isDoorSale: true,
    }));

  const rows: OrderRow[] = [...orderRows, ...doorSaleRows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const currency = rows.find((r) => r.currency)?.currency ?? "BYN";
  const netRevenue = (r: OrderRow) => (r.status === "PENDING" || r.status === "CANCELLED" ? 0 : r.total - r.refundedTotal);
  const totalRevenue = rows.reduce((sum, r) => sum + netRevenue(r), 0);
  const cashRevenue = rows.filter((r) => r.paymentMethod === "CASH").reduce((sum, r) => sum + netRevenue(r), 0);
  const transferRevenue = rows.filter((r) => r.paymentMethod === "TRANSFER").reduce((sum, r) => sum + netRevenue(r), 0);
  const totalDiscount = rows.reduce((sum, r) => sum + r.discount, 0);
  const totalRefunded = rows.reduce((sum, r) => sum + r.refundedTotal, 0);

  const basePath = `/admin/content/${event.id}/orders`;
  const currentFilterParams = { product: sp.product, method: sp.method };
  const cashHref = buildHref(basePath, currentFilterParams, { method: paymentMethod === "CASH" ? undefined : "CASH" });
  const transferHref = buildHref(basePath, currentFilterParams, { method: paymentMethod === "TRANSFER" ? undefined : "TRANSFER" });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {/* "Выручка" — тот же ярлык и место в сетке, что и на вкладке
            "Билеты" (2026-09-18, по прямому запросу пользователя): раньше
            единственная сводная цифра по всем заказам (netRevenue) была
            мелкой строкой текста под плитками, а не самой плиткой — теряла
            сравнение с "Билеты/Pass выручка" визуально. */}
        <StatCard label="Выручка" value={`${totalRevenue} ${currency}`} icon={<CardIcon />} tone="success" />
        <StatCard label="Заказов" value={rows.length} icon={<PeopleIcon />} tone="primary" />
        <StatCard
          label="Наличные"
          value={`${cashRevenue} ${currency}`}
          icon={<CardIcon />}
          tone="success"
          href={cashHref}
          active={paymentMethod === "CASH"}
        />
        <StatCard
          label="Б/н"
          value={`${transferRevenue} ${currency}`}
          icon={<CardIcon />}
          tone="success"
          href={transferHref}
          active={paymentMethod === "TRANSFER"}
        />
        <StatCard label="Скидка по промокодам" value={`${totalDiscount} ${currency}`} icon={<AlertIcon />} tone="primary" />
        <StatCard label="Возвращено" value={`${totalRefunded} ${currency}`} icon={<AlertIcon />} tone="danger" />
      </div>

      <DoorSalePanel eventSlug={event.slug} products={sellableProducts} />

      {products.length > 0 && (
        <form method="get" className="flex flex-wrap items-end gap-2 rounded-app border border-admin-border bg-admin-card/50 p-3">
          <label className="flex flex-col gap-1 text-xs text-admin-muted">
            Товар
            <Select
              name="product"
              defaultValue={sp.product ?? ""}
              className="max-w-[220px] border-admin-border bg-admin-card2 py-1.5 text-sm text-night-text focus:border-admin-primary focus:ring-admin-primary/20"
            >
              <option value="">Все товары</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-admin-muted">
            Способ оплаты
            <Select
              name="method"
              defaultValue={sp.method ?? ""}
              className="max-w-[180px] border-admin-border bg-admin-card2 py-1.5 text-sm text-night-text focus:border-admin-primary focus:ring-admin-primary/20"
            >
              <option value="">Все</option>
              <option value="CASH">Наличные</option>
              <option value="TRANSFER">Б/н (перевод)</option>
            </Select>
          </label>
          <Button type="submit" size="sm">
            Применить
          </Button>
          {(sp.product || sp.method) && (
            <a href={basePath} className="text-sm text-admin-muted hover:text-night-text hover:underline">
              Сбросить
            </a>
          )}
        </form>
      )}

      <OrdersTable orders={rows} />
    </div>
  );
}
