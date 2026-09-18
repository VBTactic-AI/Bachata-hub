-- Bachata HUB — промокод независимо от Pass (2026-09-18, по прямому
-- запросу пользователя: "скидка может существовать вне зависимости от
-- pass билета"). Зеркалит PromoCodePass — та же схема "пусто = применим к
-- любому TicketType события", раздельно по осям от passes (см. комментарий
-- у PromoCode.ticketTypes в schema.prisma).

CREATE TABLE "PromoCodeTicketType" (
    "id" TEXT NOT NULL,
    "promoCodeId" TEXT NOT NULL,
    "ticketTypeId" TEXT NOT NULL,
    CONSTRAINT "PromoCodeTicketType_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PromoCodeTicketType_promoCodeId_ticketTypeId_key" ON "PromoCodeTicketType"("promoCodeId", "ticketTypeId");
CREATE INDEX "PromoCodeTicketType_ticketTypeId_idx" ON "PromoCodeTicketType"("ticketTypeId");

ALTER TABLE "PromoCodeTicketType" ADD CONSTRAINT "PromoCodeTicketType_promoCodeId_fkey"
    FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromoCodeTicketType" ADD CONSTRAINT "PromoCodeTicketType_ticketTypeId_fkey"
    FOREIGN KEY ("ticketTypeId") REFERENCES "TicketType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PromoCodeTicketType" ENABLE ROW LEVEL SECURITY;
