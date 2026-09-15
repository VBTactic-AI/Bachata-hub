-- Bachata HUB — Ticket: конкретный экземпляр доступа, купленный/выданный
-- одним танцором на один Pass. НЕ дублирует EventRegistration — та остаётся
-- единственным источником истины "иду ли я на событие" + door check-in.
-- Уникальность по (dancerId, passId), а не по (dancerId, eventId): танцор не
-- может купить один и тот же Pass дважды, но может держать несколько Ticket
-- на одно мероприятие, если купил несколько РАЗНЫХ Pass этого события.

CREATE TYPE "TicketStatus" AS ENUM ('ISSUED', 'CANCELLED', 'REFUNDED');

CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "passId" TEXT NOT NULL,
    "dancerId" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'ISSUED',
    "price" DECIMAL(10,2),
    "currency" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Ticket_dancerId_passId_key" ON "Ticket"("dancerId", "passId");
CREATE INDEX "Ticket_passId_idx" ON "Ticket"("passId");
CREATE INDEX "Ticket_dancerId_idx" ON "Ticket"("dancerId");

ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_passId_fkey"
    FOREIGN KEY ("passId") REFERENCES "Pass"("id") ON UPDATE CASCADE;
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_dancerId_fkey"
    FOREIGN KEY ("dancerId") REFERENCES "Dancer"("id") ON UPDATE CASCADE;

ALTER TABLE "Ticket" ENABLE ROW LEVEL SECURITY;
