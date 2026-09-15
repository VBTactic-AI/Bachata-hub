-- Bachata HUB — Ticket Engine + Payment: простой штампик isPaid/paidAt на
-- Ticket (НЕ то же самое, что EventRegistration.isPaid — тот про явку на
-- событие, этот про оплату КОНКРЕТНОГО купленного Pass), плюс issuedById
-- (кто из организатора/команды выдал билет, тот же принцип, что
-- EventRegistration.checkedInById).

ALTER TABLE "Ticket" ADD COLUMN "isPaid" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Ticket" ADD COLUMN "paidAt" TIMESTAMP(3);
ALTER TABLE "Ticket" ADD COLUMN "issuedById" TEXT;

CREATE INDEX "Ticket_passId_status_idx" ON "Ticket"("passId", "status");

ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_issuedById_fkey"
    FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
