-- Upload/Compression/Cache задача (2026-09-12): EventMedia больше не хранит
-- оригинал файла как есть — только обработанный WebP, поэтому нужен
-- отдельный originalSize для оценки эффективности сжатия, и contentHash для
-- дешёвой защиты от повторной загрузки одного и того же файла в событие.
ALTER TABLE "EventMedia" ADD COLUMN "originalSize" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "EventMedia" ADD COLUMN "contentHash" TEXT;
CREATE INDEX "EventMedia_eventId_contentHash_idx" ON "EventMedia"("eventId", "contentHash");
