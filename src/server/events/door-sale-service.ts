import type { DoorSale, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasEventAccess, isOwnerOrAdmin } from "./access";
import { RegistrationForbiddenError, RegistrationNotFoundError } from "./registration-service";
import { getCurrentPassPrice } from "./pass-service";
import { assertOnSale, TicketValidationError } from "./ticket-service";

export { TicketValidationError };

// "Продажа на входе" (2026-09-18, по прямому запросу пользователя) — см.
// комментарий у модели DoorSale в schema.prisma. Права записи — тот же
// уровень, что и у обычной выдачи билета (hasEventAccess, любой член
// команды события, не только владелец/ADMIN) — это именно повседневное
// door-действие, а не настройка события. Права ЧТЕНИЯ списка — как у
// order-service.ts (isOwnerOrAdmin, финансовые данные), т.к. отображается
// вместе с Order на вкладке "Заказы".

export type SellableProduct = { productId: string; kind: "pass" | "tickettype"; name: string; price: number | null; currency: string | null };

// Каталог "что можно продать на входе прямо сейчас" — только ACTIVE-товары
// (assertOnSale отклонит любой другой статус в момент самой продажи, но
// показывать организатору в пикере то, что он всё равно не сможет продать,
// незачем).
export async function listSellableProductsForEvent(eventId: string, user: User): Promise<SellableProduct[]> {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw new RegistrationNotFoundError();
  if (!(await hasEventAccess(event, user))) throw new RegistrationForbiddenError("forbidden");

  const [passes, ticketTypes] = await Promise.all([
    prisma.pass.findMany({ where: { eventId, status: "ACTIVE" }, include: { priceTiers: true }, orderBy: { sortOrder: "asc" } }),
    prisma.ticketType.findMany({ where: { eventId, status: "ACTIVE" }, orderBy: { sortOrder: "asc" } }),
  ]);

  return [
    ...passes.map((p) => {
      const effective = getCurrentPassPrice(p, p.priceTiers);
      return { productId: p.id, kind: "pass" as const, name: p.name, price: effective.price, currency: effective.currency };
    }),
    ...ticketTypes.map((t) => ({
      productId: t.id,
      kind: "tickettype" as const,
      name: t.name,
      price: t.price == null ? null : Number(t.price),
      currency: t.currency,
    })),
  ];
}

// productId здесь — id самого Pass/TicketType (как приходит из
// listSellableProductsForEvent выше), не Product.id — тот же принцип, что и
// у issueTicket()/issueTicketForType(), сама Product-запись ищется внутри.
export async function recordDoorSale(
  eventId: string,
  kind: "pass" | "tickettype",
  productSourceId: string,
  method: "CASH" | "TRANSFER",
  user: User,
  note?: string
): Promise<DoorSale> {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw new RegistrationNotFoundError();
  if (!(await hasEventAccess(event, user))) throw new RegistrationForbiddenError("forbidden");

  return prisma.$transaction(async (tx) => {
    if (kind === "pass") {
      // Advisory lock на Pass — тот же приём, что и в issueTicket(), чтобы
      // одновременная обычная продажа и продажа на входе не увидели оба
      // "есть место" до commit друг друга.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${productSourceId}))`;
      const pass = await tx.pass.findUnique({ where: { id: productSourceId }, include: { priceTiers: true } });
      if (!pass || pass.eventId !== eventId) throw new RegistrationNotFoundError();
      assertOnSale(pass);
      if (pass.quantity != null && pass.soldQuantity >= pass.quantity) {
        throw new TicketValidationError("sold_out", "Свободных мест по этому Pass больше нет.");
      }
      const product = await tx.product.findUnique({ where: { passId: pass.id } });
      if (!product) throw new Error(`Product не найден для Pass ${pass.id} — рассинхронизация Commerce Engine.`);
      const effective = getCurrentPassPrice(pass, pass.priceTiers);

      const sale = await tx.doorSale.create({
        data: {
          eventId,
          productId: product.id,
          nameSnapshot: pass.name,
          amount: effective.price ?? 0,
          currency: effective.currency,
          method,
          note: note?.trim() || null,
          recordedById: user.id,
        },
      });

      const updated = await tx.pass.update({ where: { id: pass.id }, data: { soldQuantity: { increment: 1 } } });
      if (updated.status === "ACTIVE" && updated.quantity != null && updated.soldQuantity >= updated.quantity) {
        await tx.pass.update({ where: { id: pass.id }, data: { status: "SOLD_OUT" } });
      }
      return sale;
    }

    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${productSourceId}))`;
    const ticketType = await tx.ticketType.findUnique({ where: { id: productSourceId } });
    if (!ticketType || ticketType.eventId !== eventId) throw new RegistrationNotFoundError();
    assertOnSale(ticketType);
    if (ticketType.quantity != null && ticketType.soldQuantity >= ticketType.quantity) {
      throw new TicketValidationError("sold_out", "Свободных мест по этому билету больше нет.");
    }
    const product = await tx.product.findUnique({ where: { ticketTypeId: ticketType.id } });
    if (!product) throw new Error(`Product не найден для TicketType ${ticketType.id} — рассинхронизация Commerce Engine.`);
    const price = ticketType.price == null ? null : Number(ticketType.price);

    const sale = await tx.doorSale.create({
      data: {
        eventId,
        productId: product.id,
        nameSnapshot: ticketType.name,
        amount: price ?? 0,
        currency: ticketType.currency,
        method,
        note: note?.trim() || null,
        recordedById: user.id,
      },
    });

    const updated = await tx.ticketType.update({ where: { id: ticketType.id }, data: { soldQuantity: { increment: 1 } } });
    if (updated.status === "ACTIVE" && updated.quantity != null && updated.soldQuantity >= updated.quantity) {
      await tx.ticketType.update({ where: { id: ticketType.id }, data: { status: "SOLD_OUT" } });
    }
    return sale;
  });
}

async function requireOwnerOrAdminEvent(eventId: string, user: User) {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw new RegistrationNotFoundError();
  if (!isOwnerOrAdmin(event, user)) throw new RegistrationForbiddenError("forbidden");
  return event;
}

export async function listDoorSalesForEvent(eventId: string, user: User): Promise<DoorSale[]> {
  await requireOwnerOrAdminEvent(eventId, user);
  return prisma.doorSale.findMany({ where: { eventId }, orderBy: { createdAt: "desc" } });
}
