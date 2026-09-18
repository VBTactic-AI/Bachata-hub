-- Bachata HUB — "Продажа на входе" (2026-09-18, по прямому запросу
-- пользователя): анонимный приём оплаты за Pass/TicketType от человека без
-- аккаунта на сайте, когда организатору важен только общий оборот. Отдельная
-- модель — Order/Ticket.dancerId обязательны и завязаны на реального Dancer
-- (свой User), а Ticket дополнительно подчиняется "максимум один билет на
-- танцора на событие" (см. комментарий у модели DoorSale в schema.prisma).

CREATE TABLE "DoorSale" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "nameSnapshot" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT,
    "method" "PaymentMethod" NOT NULL,
    "note" TEXT,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DoorSale_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DoorSale_eventId_idx" ON "DoorSale"("eventId");
CREATE INDEX "DoorSale_productId_idx" ON "DoorSale"("productId");

ALTER TABLE "DoorSale" ADD CONSTRAINT "DoorSale_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DoorSale" ADD CONSTRAINT "DoorSale_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DoorSale" ADD CONSTRAINT "DoorSale_recordedById_fkey"
    FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DoorSale" ENABLE ROW LEVEL SECURITY;
