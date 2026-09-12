-- Event Media Gallery — заменяет EventImage (та же сессия, 0 строк в БД,
-- переименование/расширение модели, не откат реальных данных):
-- isCover->isMain, order->sortOrder, path->storageKey, + type/mimeType/
-- fileSize/width/height/originalName/objectPosition/updatedAt.
DROP TABLE IF EXISTS "EventImage";

CREATE TYPE "EventMediaType" AS ENUM ('IMAGE');

CREATE TABLE "EventMedia" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" "EventMediaType" NOT NULL DEFAULT 'IMAGE',
    "url" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "isMain" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "originalName" TEXT,
    "objectPosition" TEXT NOT NULL DEFAULT 'center',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventMedia_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EventMedia_eventId_idx" ON "EventMedia"("eventId");
CREATE INDEX "EventMedia_eventId_isMain_idx" ON "EventMedia"("eventId", "isMain");
ALTER TABLE "EventMedia" ADD CONSTRAINT "EventMedia_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventMedia" ENABLE ROW LEVEL SECURITY;
