import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isOwnerOrAdmin } from "./access";
import { RegistrationForbiddenError, RegistrationNotFoundError } from "./registration-service";

// Commerce Engine v1 (2026-09-17) — только ЧТЕНИЕ (§32 задачи, "Admin
// Commerce → Orders/Payments/Refunds"). Записи создаются исключительно
// сервисным слоем ticket-service.ts (issueTicket/issueTicketForType/
// cancelTicket/refundTicket) — здесь нет ни одной мутации, только витрина уже
// существующих Order/OrderItem/Payment/Refund для организатора.
//
// Доступ — isOwnerOrAdmin (не hasEventAccess, как у списка билетов): история
// заказов/платежей/возвратов — финансовые данные события, а не то, что нужно
// рядовому члену команды для повседневной выдачи билетов (тот же уровень
// доступа, что и у PromoCode в pass-service.ts).
async function requireOwnerOrAdminEvent(eventId: string, user: User) {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw new RegistrationNotFoundError();
  if (!isOwnerOrAdmin(event, user)) throw new RegistrationForbiddenError("forbidden");
  return event;
}

export type OrderListFilters = {
  productId?: string;
  paymentMethod?: "CASH" | "TRANSFER";
};

export async function listOrdersForEvent(eventId: string, user: User, filters: OrderListFilters = {}) {
  await requireOwnerOrAdminEvent(eventId, user);

  return prisma.order.findMany({
    where: {
      eventId,
      ...(filters.productId ? { items: { some: { productId: filters.productId } } } : {}),
      ...(filters.paymentMethod ? { payments: { some: { method: filters.paymentMethod } } } : {}),
    },
    include: {
      dancer: { select: { id: true, displayName: true, avatarUrl: true } },
      items: { include: { product: { select: { type: true } } } },
      payments: true,
      refunds: true,
      promoCode: { select: { code: true } },
      referralCode: { select: { code: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

// Список товаров события для фильтра "Заказов" по товару (2026-09-18) —
// Product сам по себе безымянный (тонкая обёртка, см. комментарий у модели в
// schema.prisma), название берём из Pass/TicketType.
export async function listProductsForEvent(eventId: string, user: User) {
  await requireOwnerOrAdminEvent(eventId, user);
  const products = await prisma.product.findMany({
    where: { eventId },
    include: { pass: { select: { name: true } }, ticketType: { select: { name: true } } },
  });
  return products.map((p) => ({ id: p.id, name: p.pass?.name ?? p.ticketType?.name ?? "—", type: p.type }));
}

export async function getOrder(orderId: string, user: User) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      dancer: { select: { id: true, displayName: true, avatarUrl: true } },
      items: { include: { product: { select: { type: true } }, passPriceTier: { select: { label: true } } } },
      payments: { include: { recordedBy: { select: { id: true, email: true } } } },
      refunds: { include: { recordedBy: { select: { id: true, email: true } } } },
      promoCode: { select: { code: true } },
      referralCode: { select: { code: true } },
    },
  });
  if (!order) throw new RegistrationNotFoundError();
  await requireOwnerOrAdminEvent(order.eventId, user);
  return order;
}
