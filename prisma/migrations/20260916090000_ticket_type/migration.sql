-- Bachata HUB — TicketType + Event.ticketingMode (2026-09-16, Ticket Engine
-- v2, по прямому запросу пользователя после разбора модели Ticket/Pass).
-- TicketType — простой билет на ОДНО событие ("Teacher/Dancer/School
-- Partner"), Pass остаётся отдельной, НЕ переименованной и НЕ суженной
-- сущностью для доступа к нескольким событиям (см. комментарий у моделей в
-- schema.prisma). Ticket.passId и Ticket.ticketTypeId взаимоисключающи.

-- Event.ticketingMode — UI-подсказка "способ доступа" (Free/Tickets/Passes/
-- оба), выбирается в мастере создания события.
CREATE TYPE "EventTicketingMode" AS ENUM ('UNSET', 'FREE', 'TICKETS', 'PASSES', 'TICKETS_AND_PASSES');
ALTER TABLE "Event" ADD COLUMN "ticketingMode" "EventTicketingMode" NOT NULL DEFAULT 'UNSET';

-- TicketType — переиспользует PassStatus (тот же жизненный цикл DRAFT/
-- ACTIVE/PAUSED/SOLD_OUT/ENDED/ARCHIVED), enum уже существует.
CREATE TABLE "TicketType" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(10,2),
    "currency" TEXT,
    "quantity" INTEGER,
    "soldQuantity" INTEGER NOT NULL DEFAULT 0,
    "salesStartAt" TIMESTAMP(3),
    "salesEndAt" TIMESTAMP(3),
    "status" "PassStatus" NOT NULL DEFAULT 'DRAFT',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TicketType_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TicketType_eventId_idx" ON "TicketType"("eventId");
CREATE INDEX "TicketType_eventId_status_idx" ON "TicketType"("eventId", "status");
ALTER TABLE "TicketType" ADD CONSTRAINT "TicketType_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TicketType" ENABLE ROW LEVEL SECURITY;

-- Ticket.ticketTypeId — взаимоисключающе с passId (CHECK ниже).
ALTER TABLE "Ticket" ADD COLUMN "ticketTypeId" TEXT;
CREATE INDEX "Ticket_ticketTypeId_idx" ON "Ticket"("ticketTypeId");
CREATE INDEX "Ticket_ticketTypeId_status_idx" ON "Ticket"("ticketTypeId", "status");
CREATE UNIQUE INDEX "Ticket_dancerId_ticketTypeId_key" ON "Ticket"("dancerId", "ticketTypeId");
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_ticketTypeId_fkey"
    FOREIGN KEY ("ticketTypeId") REFERENCES "TicketType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_at_most_one_product" CHECK (
    (("passId" IS NOT NULL)::int + ("ticketTypeId" IS NOT NULL)::int) <= 1
);

-- Старый частичный индекс защищал только "один passless Ticket на танцора
-- на событие" (WHERE passId IS NULL) — теперь, когда billet может быть
-- "typeless" (ticketTypeId), но НЕ passless, этот же WHERE-предикат ошибочно
-- считал бы такие строки коллизией с настоящим passless-fallback'ом.
-- Пересоздаём с точным условием "нет вообще никакого продукта".
DROP INDEX "Ticket_dancerId_eventId_no_pass_key";
CREATE UNIQUE INDEX "Ticket_dancerId_eventId_no_product_key" ON "Ticket"("dancerId", "eventId")
    WHERE "passId" IS NULL AND "ticketTypeId" IS NULL;
