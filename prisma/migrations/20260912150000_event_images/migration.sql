-- Event Engine — галерея загружаемых афиш (EventImage), Event.photoUrl
-- остаётся как денормализованный кэш текущей обложки (см. комментарий у поля
-- в schema.prisma) — существующие события с внешней ссылкой не трогаем.
CREATE TABLE "EventImage" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "isCover" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventImage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EventImage_eventId_idx" ON "EventImage"("eventId");
ALTER TABLE "EventImage" ADD CONSTRAINT "EventImage_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventImage" ENABLE ROW LEVEL SECURITY;
