-- Bachata HUB — Commerce Engine v1, Phase 1 (2026-09-17). Только схема,
-- аддитивно — ничего из существующих Pass/TicketType/Ticket/PromoCode не
-- меняется и не удаляется, никакой backfill здесь ещё не выполняется
-- (Phase 2, отдельная миграция). Три развилки, подтверждённые пользователем
-- перед этой миграцией (см. docs/00_DECISIONS.md):
-- 1. Product — тонкая обёртка НАД существующими Pass/TicketType (не слияние
--    их в одну таблицу, вчерашнее решение D10 не отменяется). У Product нет
--    ни одного коммерческого поля (price/quantity) — единственный источник
--    цены/остатка мест остаётся Pass(+PassPriceTier)/TicketType, как и сейчас.
-- 2. Payment.provider — сегодня только MANUAL (организатор вручную
--    подтверждает получение денег, как и раньше через Ticket.isPaid).
--    Реальный онлайн-эквайринг — отдельная будущая задача (PAY-001).
-- 3. Order.dancerId — один и тот же человек одновременно платит и получает
--    доступ ("покупка для друзей" не реализуется сейчас).

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE "ProductType" AS ENUM ('PASS', 'EVENT_TICKET');
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED', 'CANCELLED');
CREATE TYPE "PaymentProvider" AS ENUM ('MANUAL');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'CANCELLED');
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED');
CREATE TYPE "UserPassStatus" AS ENUM ('ACTIVE', 'REVOKED');
CREATE TYPE "CheckInMethod" AS ENUM ('QR', 'MANUAL', 'ADMIN');

-- ---------------------------------------------------------------------------
-- Product — идентификатор "что продаётся" для Order/OrderItem. Ровно одно из
-- passId/ticketTypeId заполнено, и оно должно соответствовать type (CHECK
-- ниже — Prisma DSL не поддерживает декларативный CHECK, тот же приём, что
-- уже используется у PassAccessGrant/Ticket в предыдущих миграциях).
-- ---------------------------------------------------------------------------

CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" "ProductType" NOT NULL,
    "passId" TEXT,
    "ticketTypeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Product_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Product_type_matches_target" CHECK (
        ("type" = 'PASS' AND "passId" IS NOT NULL AND "ticketTypeId" IS NULL)
        OR ("type" = 'EVENT_TICKET' AND "ticketTypeId" IS NOT NULL AND "passId" IS NULL)
    )
);
CREATE UNIQUE INDEX "Product_passId_key" ON "Product"("passId");
CREATE UNIQUE INDEX "Product_ticketTypeId_key" ON "Product"("ticketTypeId");
CREATE INDEX "Product_eventId_idx" ON "Product"("eventId");
CREATE INDEX "Product_eventId_type_idx" ON "Product"("eventId", "type");
ALTER TABLE "Product" ADD CONSTRAINT "Product_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Product" ADD CONSTRAINT "Product_passId_fkey"
    FOREIGN KEY ("passId") REFERENCES "Pass"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Product" ADD CONSTRAINT "Product_ticketTypeId_fkey"
    FOREIGN KEY ("ticketTypeId") REFERENCES "TicketType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Product" ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Order/OrderItem — заказ и его строки. dancerId — один и тот же человек
-- платит и получает доступ (решение 3 выше). Снимок цены/названия — на
-- OrderItem, не пересчитывается при изменении Product/Pass/TicketType.
-- ---------------------------------------------------------------------------

CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "dancerId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "currency" TEXT,
    "subtotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "promoCodeId" TEXT,
    "referralCodeId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Order_eventId_idx" ON "Order"("eventId");
CREATE INDEX "Order_dancerId_idx" ON "Order"("dancerId");
CREATE INDEX "Order_eventId_status_idx" ON "Order"("eventId", "status");
ALTER TABLE "Order" ADD CONSTRAINT "Order_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_dancerId_fkey"
    FOREIGN KEY ("dancerId") REFERENCES "Dancer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_promoCodeId_fkey"
    FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_referralCodeId_fkey"
    FOREIGN KEY ("referralCodeId") REFERENCES "FestivalReferralCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Order" ENABLE ROW LEVEL SECURITY;

CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "passPriceTierId" TEXT,
    "nameSnapshot" TEXT NOT NULL,
    "unitPriceSnapshot" DECIMAL(10,2),
    "currencySnapshot" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "discountAmount" DECIMAL(10,2),
    "total" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");
CREATE INDEX "OrderItem_productId_idx" ON "OrderItem"("productId");
CREATE INDEX "OrderItem_passPriceTierId_idx" ON "OrderItem"("passPriceTierId");
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_passPriceTierId_fkey"
    FOREIGN KEY ("passPriceTierId") REFERENCES "PassPriceTier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrderItem" ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Payment/Refund — факт денег. provider сегодня всегда MANUAL (решение 2
-- выше). Один Order может иметь несколько Payment; один Payment — несколько
-- Refund (частичные возвраты по отдельности).
-- ---------------------------------------------------------------------------

CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL DEFAULT 'MANUAL',
    "providerPaymentId" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Payment_providerPaymentId_key" ON "Payment"("providerPaymentId");
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");
CREATE INDEX "Payment_orderId_status_idx" ON "Payment"("orderId", "status");
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_recordedById_fkey"
    FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ENABLE ROW LEVEL SECURITY;

CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT,
    "reason" TEXT NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'COMPLETED',
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Refund_paymentId_idx" ON "Refund"("paymentId");
CREATE INDEX "Refund_orderId_idx" ON "Refund"("orderId");
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentId_fkey"
    FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_recordedById_fkey"
    FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Refund" ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- UserPass — конкретное право конкретного танцора на конкретный Pass
-- (definition = Pass, holder's right = UserPass). orderItemId nullable —
-- сегодня сервисный слой всегда создаёт вместе с OrderItem, задел под
-- будущие безоплатные/подарочные гранты.
-- ---------------------------------------------------------------------------

CREATE TABLE "UserPass" (
    "id" TEXT NOT NULL,
    "dancerId" TEXT NOT NULL,
    "passId" TEXT NOT NULL,
    "orderItemId" TEXT,
    "status" "UserPassStatus" NOT NULL DEFAULT 'ACTIVE',
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserPass_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UserPass_dancerId_passId_key" ON "UserPass"("dancerId", "passId");
CREATE INDEX "UserPass_passId_idx" ON "UserPass"("passId");
ALTER TABLE "UserPass" ADD CONSTRAINT "UserPass_dancerId_fkey"
    FOREIGN KEY ("dancerId") REFERENCES "Dancer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserPass" ADD CONSTRAINT "UserPass_passId_fkey"
    FOREIGN KEY ("passId") REFERENCES "Pass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserPass" ADD CONSTRAINT "UserPass_orderItemId_fkey"
    FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UserPass" ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- TicketCheckIn — факт явки ПО КОНКРЕТНОМУ Ticket. Названо не "CheckIn" —
-- эта модель уже существует для Competition Engine (JNJ, другой домен, не
-- трогаем), имя было бы конфликтом.
-- ---------------------------------------------------------------------------

CREATE TABLE "TicketCheckIn" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "checkedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkedInById" TEXT NOT NULL,
    "method" "CheckInMethod" NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TicketCheckIn_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TicketCheckIn_ticketId_key" ON "TicketCheckIn"("ticketId");
ALTER TABLE "TicketCheckIn" ADD CONSTRAINT "TicketCheckIn_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TicketCheckIn" ADD CONSTRAINT "TicketCheckIn_checkedInById_fkey"
    FOREIGN KEY ("checkedInById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TicketCheckIn" ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Ticket — новые НЕОБЯЗАТЕЛЬНЫЕ связи с OrderItem/UserPass. Существующие
-- поля (passId/ticketTypeId/price/isPaid/paidAt/promoCodeId/discountAmount/
-- referralCode*) НЕ трогаются в этой миграции — ticket-service.ts продолжает
-- писать их напрямую, как и раньше, пока сервисный слой не перейдёт на
-- createOrder()/fulfillOrder() (Phase 3-4). orderItemId/userPassId и старые
-- passId/ticketTypeId будут backfill'ены отдельной миграцией (Phase 2) —
-- здесь они остаются NULL для всех существующих строк.
-- ---------------------------------------------------------------------------

ALTER TABLE "Ticket" ADD COLUMN "orderItemId" TEXT;
ALTER TABLE "Ticket" ADD COLUMN "userPassId" TEXT;
CREATE INDEX "Ticket_orderItemId_idx" ON "Ticket"("orderItemId");
CREATE INDEX "Ticket_userPassId_idx" ON "Ticket"("userPassId");
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_orderItemId_fkey"
    FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_userPassId_fkey"
    FOREIGN KEY ("userPassId") REFERENCES "UserPass"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_at_most_one_fulfillment_source" CHECK (
    (("orderItemId" IS NOT NULL)::int + ("userPassId" IS NOT NULL)::int) <= 1
);
