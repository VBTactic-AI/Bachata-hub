-- Bachata HUB — Pass (СЛОЙ 2): предложение организатора о платном/бесплатном
-- доступе к событию. Pass ≠ конкретный билет пользователя (Pass — оффер
-- организатора, будущий Ticket с полем passId — уже выданный/купленный
-- экземпляр, эта модель ещё не заводится, см. комментарий у Pass в
-- schema.prisma). НЕ дублирует EventPriceOption — та модель остаётся как
-- есть, это чисто отображаемая строка цены без запасов/статуса/продаж.

CREATE TYPE "PassType" AS ENUM ('FULL_PASS', 'PARTY_PASS', 'WORKSHOP_PASS', 'DAY_PASS', 'COMPETITION_PASS', 'VIP_PASS', 'FREE_PASS', 'CUSTOM');

CREATE TYPE "PassStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'SOLD_OUT', 'ENDED', 'ARCHIVED');

CREATE TABLE "Pass" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "PassType" NOT NULL,
    "price" DECIMAL(10,2),
    "currency" TEXT,
    "quantity" INTEGER,
    "soldQuantity" INTEGER NOT NULL DEFAULT 0,
    "salesStartAt" TIMESTAMP(3),
    "salesEndAt" TIMESTAMP(3),
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "status" "PassStatus" NOT NULL DEFAULT 'DRAFT',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Pass_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Pass_eventId_idx" ON "Pass"("eventId");
CREATE INDEX "Pass_eventId_status_idx" ON "Pass"("eventId", "status");

ALTER TABLE "Pass" ADD CONSTRAINT "Pass_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Pass" ENABLE ROW LEVEL SECURITY;
