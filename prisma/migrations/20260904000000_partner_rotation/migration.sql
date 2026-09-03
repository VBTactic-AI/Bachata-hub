-- Bachata HUB Belarus — слой 3
-- Живой танцпол — ротация партнёров (Этап 6, docs/00_DECISIONS.md, A12).
-- Два независимых сценария (подтверждено пользователем, 2026-09-04):
--   TRACK_AUTO_SHIFT — целый трек, программа сама по таймеру каждые
--     rotationIntervalSec показывает "СМЕНА" (сдвиг на 1 партнёра);
--   SEGMENT_MANUAL_SHIFT — отрезок трека, DJ вручную жмёт "Стоп", затем
--     выбирается N (rotationShiftMin..rotationShiftMax), на сколько
--     партнёров переходят.
-- Программа НЕ хранит и не назначает конкретные пары (A5, как и Draw
-- Engine) — только считает время (сервер — источник времени, CLAUDE.md §12)
-- и показывает надписи на экране, без звука.

CREATE TYPE "RotationMode" AS ENUM ('TRACK_AUTO_SHIFT', 'SEGMENT_MANUAL_SHIFT');
CREATE TYPE "RotationStatus" AS ENUM ('IDLE', 'RUNNING', 'PAUSED', 'FINISHED');

-- Настройки по умолчанию на дивизионе, с переопределением на конкретном
-- раунде — тот же паттерн, что уже есть у heatCapacity (A7).
ALTER TABLE "Division" ADD COLUMN "rotationMode" "RotationMode" NOT NULL DEFAULT 'TRACK_AUTO_SHIFT';
ALTER TABLE "Division" ADD COLUMN "rotationIntervalSec" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "Division" ADD COLUMN "rotationShiftMin" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Division" ADD COLUMN "rotationShiftMax" INTEGER NOT NULL DEFAULT 3;

ALTER TABLE "Round" ADD COLUMN "rotationMode" "RotationMode";
ALTER TABLE "Round" ADD COLUMN "rotationIntervalSec" INTEGER;
ALTER TABLE "Round" ADD COLUMN "rotationShiftMin" INTEGER;
ALTER TABLE "Round" ADD COLUMN "rotationShiftMax" INTEGER;

-- Ровно одна строка на Heat. mode/intervalSec/shiftMin/shiftMax — снимок
-- настроек на момент старта ротации (startRotation), не пересчитывается
-- задним числом при последующей правке настроек дивизиона/раунда
-- (CLAUDE.md §50/§51).
CREATE TABLE "HeatRotation" (
    "id" TEXT NOT NULL,
    "heatId" TEXT NOT NULL,
    "status" "RotationStatus" NOT NULL DEFAULT 'IDLE',
    "statusVersion" INTEGER NOT NULL DEFAULT 1,
    "mode" "RotationMode" NOT NULL,
    "intervalSec" INTEGER NOT NULL,
    "shiftMin" INTEGER NOT NULL,
    "shiftMax" INTEGER NOT NULL,
    "trackNumber" INTEGER NOT NULL DEFAULT 0,
    "trackName" TEXT,
    "segmentStartedAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "awaitingShiftChoice" BOOLEAN NOT NULL DEFAULT false,
    "pendingShiftN" INTEGER,
    "pendingShiftSource" TEXT,
    "pendingShiftSeed" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HeatRotation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "HeatRotation_heatId_key" ON "HeatRotation"("heatId");
CREATE INDEX "HeatRotation_status_idx" ON "HeatRotation"("status");
ALTER TABLE "HeatRotation" ADD CONSTRAINT "HeatRotation_heatId_fkey"
    FOREIGN KEY ("heatId") REFERENCES "Heat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HeatRotation" ENABLE ROW LEVEL SECURITY;
