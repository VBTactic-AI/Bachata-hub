-- Bachata HUB — Events Engine, этап 2: регистрация на обычное событие.
--
-- EventRegistration — НЕ то же самое, что Registration (Competition Engine,
-- Слой 3): та про J&J с ролями/дивизионами, эта — про обычные события
-- (Party/Masterclass/...) без ролей. Отдельная таблица, ничего в
-- существующей модели Registration не меняется.
--
-- isPaid/paidAt — тот же принцип ручного чекбокса, что и Registration.isPaid
-- (redesign 2026-09-09) — переиспользуем проверенный паттерн, без richer
-- PaymentStatus enum.

CREATE TYPE "EventRegistrationStatus" AS ENUM ('REGISTERED', 'CONFIRMED', 'WAITLIST', 'CANCELLED', 'REJECTED', 'NO_SHOW');

CREATE TABLE "EventRegistration" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "dancerId" TEXT NOT NULL,
    "status" "EventRegistrationStatus" NOT NULL DEFAULT 'REGISTERED',
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EventRegistration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventRegistration_eventId_dancerId_key" ON "EventRegistration"("eventId", "dancerId");
CREATE INDEX "EventRegistration_eventId_idx" ON "EventRegistration"("eventId");
CREATE INDEX "EventRegistration_dancerId_idx" ON "EventRegistration"("dancerId");
CREATE INDEX "EventRegistration_eventId_status_idx" ON "EventRegistration"("eventId", "status");

ALTER TABLE "EventRegistration" ADD CONSTRAINT "EventRegistration_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventRegistration" ADD CONSTRAINT "EventRegistration_dancerId_fkey"
    FOREIGN KEY ("dancerId") REFERENCES "Dancer"("id") ON UPDATE CASCADE;

ALTER TABLE "EventRegistration" ENABLE ROW LEVEL SECURITY;
