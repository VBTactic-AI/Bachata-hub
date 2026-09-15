-- Bachata HUB — расширение архитектуры Pass (2026-09-16, по прямому запросу
-- пользователя): ценовые периоды (Early Bird/Regular/Late), гранулярный
-- доступ к пунктам программы/сессиям мастер-класса, промокоды (только
-- схема — расчёт скидки сознательно не реализован в этой правке), обложка
-- Pass и флаг повторного входа (для будущего door check-in).

-- Pass: обложка + флаг повторного входа.
ALTER TABLE "Pass" ADD COLUMN "imageUrl" TEXT;
ALTER TABLE "Pass" ADD COLUMN "allowMultipleEntry" BOOLEAN NOT NULL DEFAULT true;

-- Ценовые периоды.
CREATE TABLE "PassPriceTier" (
    "id" TEXT NOT NULL,
    "passId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "currency" TEXT,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PassPriceTier_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PassPriceTier_passId_idx" ON "PassPriceTier"("passId");
ALTER TABLE "PassPriceTier" ADD CONSTRAINT "PassPriceTier_passId_fkey"
    FOREIGN KEY ("passId") REFERENCES "Pass"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PassPriceTier" ENABLE ROW LEVEL SECURITY;

-- Гранулярный доступ к пунктам программы/сессиям мастер-класса. Ровно одно
-- из двух полей должно быть заполнено — Prisma DSL не поддерживает
-- декларативный CHECK, поэтому ограничение добавлено здесь напрямую.
CREATE TABLE "PassAccessGrant" (
    "id" TEXT NOT NULL,
    "passId" TEXT NOT NULL,
    "programItemId" TEXT,
    "masterclassSessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PassAccessGrant_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PassAccessGrant_exactly_one_target" CHECK (
        (("programItemId" IS NOT NULL)::int + ("masterclassSessionId" IS NOT NULL)::int) = 1
    )
);
CREATE UNIQUE INDEX "PassAccessGrant_passId_programItemId_key" ON "PassAccessGrant"("passId", "programItemId");
CREATE UNIQUE INDEX "PassAccessGrant_passId_masterclassSessionId_key" ON "PassAccessGrant"("passId", "masterclassSessionId");
CREATE INDEX "PassAccessGrant_passId_idx" ON "PassAccessGrant"("passId");
CREATE INDEX "PassAccessGrant_programItemId_idx" ON "PassAccessGrant"("programItemId");
CREATE INDEX "PassAccessGrant_masterclassSessionId_idx" ON "PassAccessGrant"("masterclassSessionId");
ALTER TABLE "PassAccessGrant" ADD CONSTRAINT "PassAccessGrant_passId_fkey"
    FOREIGN KEY ("passId") REFERENCES "Pass"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PassAccessGrant" ADD CONSTRAINT "PassAccessGrant_programItemId_fkey"
    FOREIGN KEY ("programItemId") REFERENCES "EventProgramItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PassAccessGrant" ADD CONSTRAINT "PassAccessGrant_masterclassSessionId_fkey"
    FOREIGN KEY ("masterclassSessionId") REFERENCES "MasterclassSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PassAccessGrant" ENABLE ROW LEVEL SECURITY;

-- Промокоды.
CREATE TYPE "PromoDiscountType" AS ENUM ('PERCENT', 'FIXED_AMOUNT');

CREATE TABLE "PromoCode" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "discountType" "PromoDiscountType" NOT NULL,
    "discountValue" DECIMAL(10,2) NOT NULL,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PromoCode_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PromoCode_eventId_code_key" ON "PromoCode"("eventId", "code");
CREATE INDEX "PromoCode_eventId_idx" ON "PromoCode"("eventId");
ALTER TABLE "PromoCode" ADD CONSTRAINT "PromoCode_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromoCode" ENABLE ROW LEVEL SECURITY;

CREATE TABLE "PromoCodePass" (
    "id" TEXT NOT NULL,
    "promoCodeId" TEXT NOT NULL,
    "passId" TEXT NOT NULL,
    CONSTRAINT "PromoCodePass_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PromoCodePass_promoCodeId_passId_key" ON "PromoCodePass"("promoCodeId", "passId");
CREATE INDEX "PromoCodePass_passId_idx" ON "PromoCodePass"("passId");
ALTER TABLE "PromoCodePass" ADD CONSTRAINT "PromoCodePass_promoCodeId_fkey"
    FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromoCodePass" ADD CONSTRAINT "PromoCodePass_passId_fkey"
    FOREIGN KEY ("passId") REFERENCES "Pass"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromoCodePass" ENABLE ROW LEVEL SECURITY;

-- Ticket: аудит применённого промокода (без механики расчёта).
ALTER TABLE "Ticket" ADD COLUMN "promoCodeId" TEXT;
ALTER TABLE "Ticket" ADD COLUMN "discountAmount" DECIMAL(10,2);
CREATE INDEX "Ticket_promoCodeId_idx" ON "Ticket"("promoCodeId");
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_promoCodeId_fkey"
    FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
