// Commerce Engine v1 — Phase 2 (backfill, 2026-09-17). Переносит СУЩЕСТВУЮЩИЕ
// Pass/TicketType/Ticket в новые Product/Order/OrderItem/Payment/UserPass —
// см. docs/00_DECISIONS.md (Commerce Engine v1, аудит Ticket/Pass/Commerce).
// Ничего из старых полей Ticket не удаляется и не меняется — это ТОЛЬКО
// заполнение новых таблиц/связей рядом со старыми (ticket-service.ts пока
// продолжает писать passId/ticketTypeId/price/isPaid напрямую).
//
// Идемпотентно и безопасно перезапускать: каждый шаг обрабатывает только то,
// что ещё не перенесено (Product отсутствует / Ticket.orderItemId и
// userPassId ещё null) — повторный запуск на уже перенесённых данных не
// создаёт дублей.
//
// Осознанная граница (см. audit-переписку): "passless"/"typeless" Ticket
// (оба passId и ticketTypeId — null, ленивый fallback для событий без
// каталога вообще) ОСТАЮТСЯ вне Order/Payment — для них нет Product, платить
// не за что в смысле новой модели, isPaid/paidAt остаются единственным
// источником истины, как и раньше.
//
// "Производный" Ticket Pass-а фестиваля (price = null у Ticket с passId не
// null — вход на дочернее событие, деньги уже получены на событии фестиваля,
// см. комментарий у issueFestivalPassEntry в ticket-service.ts) получает
// userPassId, но НЕ получает собственный Order/Payment — это не отдельная
// покупка.
//
// Запуск: npx tsx prisma/backfill-commerce-engine-v1.ts
// Предпросмотр без изменений: npx tsx prisma/backfill-commerce-engine-v1.ts --dry-run
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");

function orderStatusFor(ticket: { status: string; isPaid: boolean }): "PENDING" | "PAID" | "REFUNDED" | "CANCELLED" {
  if (ticket.status === "REFUNDED") return "REFUNDED";
  if (ticket.status === "CANCELLED") return "CANCELLED";
  return ticket.isPaid ? "PAID" : "PENDING";
}

function paymentStatusFor(ticket: { isPaid: boolean }): "PENDING" | "PAID" {
  return ticket.isPaid ? "PAID" : "PENDING";
}

async function backfillProducts() {
  const passesWithoutProduct = await prisma.pass.findMany({ where: { product: null }, select: { id: true, eventId: true } });
  const ticketTypesWithoutProduct = await prisma.ticketType.findMany({ where: { product: null }, select: { id: true, eventId: true } });

  console.log(`Product: ${passesWithoutProduct.length} Pass без Product, ${ticketTypesWithoutProduct.length} TicketType без Product.`);
  if (dryRun) return;

  for (const pass of passesWithoutProduct) {
    await prisma.product.create({ data: { eventId: pass.eventId, type: "PASS", passId: pass.id } });
  }
  for (const tt of ticketTypesWithoutProduct) {
    await prisma.product.create({ data: { eventId: tt.eventId, type: "EVENT_TICKET", ticketTypeId: tt.id } });
  }
}

// Группирует ticket-строки конкретного Pass по держателю — один UserPass на
// (dancerId, passId), даже если у танцора несколько Ticket на этот Pass
// (реальная покупка + производные входы на дочерние события фестиваля).
async function backfillPassTickets() {
  const tickets = await prisma.ticket.findMany({
    where: { passId: { not: null }, userPassId: null },
    include: { pass: true },
    orderBy: { issuedAt: "asc" },
  });
  console.log(`UserPass/Order (Pass): ${tickets.length} Ticket с passId ещё не перенесены.`);
  if (dryRun) return;

  for (const ticket of tickets) {
    if (!ticket.passId || !ticket.pass) continue; // TS guard, уже отфильтровано условием where

    const userPass = await prisma.userPass.upsert({
      where: { dancerId_passId: { dancerId: ticket.dancerId, passId: ticket.passId } },
      update: {},
      create: { dancerId: ticket.dancerId, passId: ticket.passId, status: "ACTIVE" },
    });

    let orderItemId: string | null = null;

    // ticket.price != null — настоящая покупка (не производный вход на
    // дочернее событие фестиваля, см. комментарий в шапке файла).
    if (ticket.price != null) {
      const product = await prisma.product.findUnique({ where: { passId: ticket.passId } });
      if (!product) throw new Error(`Product не найден для Pass ${ticket.passId} — сначала backfillProducts()`);
      if (!ticket.issuedById) {
        throw new Error(`Ticket ${ticket.id}: цена задана, но issuedById пуст — Order.createdById не может быть NULL, требуется ручное решение.`);
      }

      const discount = ticket.discountAmount != null ? Number(ticket.discountAmount) : 0;
      const subtotal = Number(ticket.price);
      const total = Math.max(subtotal - discount, 0);

      const result = await prisma.$transaction(async (tx) => {
        const order = await tx.order.create({
          data: {
            eventId: ticket.eventId,
            dancerId: ticket.dancerId,
            status: orderStatusFor(ticket),
            currency: ticket.currency,
            subtotal,
            discount,
            total,
            promoCodeId: ticket.promoCodeId,
            referralCodeId: ticket.referralCodeId,
            createdById: ticket.issuedById!,
            createdAt: ticket.issuedAt,
          },
        });
        const item = await tx.orderItem.create({
          data: {
            orderId: order.id,
            productId: product.id,
            nameSnapshot: ticket.pass!.name,
            unitPriceSnapshot: ticket.price,
            currencySnapshot: ticket.currency,
            quantity: 1,
            discountAmount: ticket.discountAmount,
            total,
            createdAt: ticket.issuedAt,
          },
        });
        await tx.payment.create({
          data: {
            orderId: order.id,
            provider: "MANUAL",
            amount: total,
            currency: ticket.currency,
            status: paymentStatusFor(ticket),
            paidAt: ticket.paidAt,
            recordedById: ticket.issuedById!,
            createdAt: ticket.issuedAt,
          },
        });
        return item;
      });
      orderItemId = result.id;
    }

    await prisma.ticket.update({ where: { id: ticket.id }, data: { userPassId: userPass.id } });
    if (orderItemId && !userPass.orderItemId) {
      await prisma.userPass.update({ where: { id: userPass.id }, data: { orderItemId } });
    }
  }
}

async function backfillTicketTypeTickets() {
  const tickets = await prisma.ticket.findMany({
    where: { ticketTypeId: { not: null }, orderItemId: null },
    include: { ticketType: true },
    orderBy: { issuedAt: "asc" },
  });
  console.log(`Order (TicketType): ${tickets.length} Ticket с ticketTypeId ещё не перенесены.`);
  if (dryRun) return;

  for (const ticket of tickets) {
    if (!ticket.ticketTypeId || !ticket.ticketType) continue;
    if (!ticket.issuedById) {
      throw new Error(`Ticket ${ticket.id}: TicketType-билет без issuedById — Order.createdById не может быть NULL, требуется ручное решение.`);
    }

    const product = await prisma.product.findUnique({ where: { ticketTypeId: ticket.ticketTypeId } });
    if (!product) throw new Error(`Product не найден для TicketType ${ticket.ticketTypeId} — сначала backfillProducts()`);

    const discount = ticket.discountAmount != null ? Number(ticket.discountAmount) : 0;
    const subtotal = ticket.price != null ? Number(ticket.price) : 0;
    const total = Math.max(subtotal - discount, 0);

    await prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          eventId: ticket.eventId,
          dancerId: ticket.dancerId,
          status: orderStatusFor(ticket),
          currency: ticket.currency,
          subtotal,
          discount,
          total,
          promoCodeId: ticket.promoCodeId,
          referralCodeId: ticket.referralCodeId,
          createdById: ticket.issuedById!,
          createdAt: ticket.issuedAt,
        },
      });
      const item = await tx.orderItem.create({
        data: {
          orderId: order.id,
          productId: product.id,
          nameSnapshot: ticket.ticketType!.name,
          unitPriceSnapshot: ticket.price,
          currencySnapshot: ticket.currency,
          quantity: 1,
          discountAmount: ticket.discountAmount,
          total,
          createdAt: ticket.issuedAt,
        },
      });
      await tx.payment.create({
        data: {
          orderId: order.id,
          provider: "MANUAL",
          amount: total,
          currency: ticket.currency,
          status: paymentStatusFor(ticket),
          paidAt: ticket.paidAt,
          recordedById: ticket.issuedById!,
          createdAt: ticket.issuedAt,
        },
      });
      await tx.ticket.update({ where: { id: ticket.id }, data: { orderItemId: item.id } });
    });
  }
}

async function main() {
  console.log("=== Commerce Engine v1 — backfill (Phase 2) ===");
  console.log(dryRun ? "(режим предпросмотра — ничего не изменится)\n" : "");

  await backfillProducts();
  await backfillPassTickets();
  await backfillTicketTypeTickets();

  const passlessCount = await prisma.ticket.count({ where: { passId: null, ticketTypeId: null } });
  console.log(`\nPassless/typeless Ticket (сознательно вне Order/Payment): ${passlessCount}.`);
  console.log("Готово.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
