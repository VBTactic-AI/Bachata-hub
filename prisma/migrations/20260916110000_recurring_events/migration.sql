-- Recurring Events (Event Templates / Event Series) — 2026-09-16
--
-- Только аддитивные изменения: 2 новые таблицы + 2 новых enum'а + 2 новых
-- nullable-колонки на уже существующем Event. Ничего из существующих таблиц
-- не удаляется и не переименовывается.
--
-- Примечание: `prisma migrate diff` против реальной БД заодно показал
-- несвязанный с этой задачей drift (SchoolClaim/ClaimStatus, которые давно
-- убраны из schema.prisma, но физически ещё не дропнуты в БД, плюс несколько
-- FK/индексов, переcозданных под тем же именем) — сознательно НЕ включено в
-- эту миграцию, т.к. не относится к Recurring Events (CLAUDE.md §54,
-- минимальный набор изменений).

-- CreateEnum
CREATE TYPE "EventTemplateStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "EventSeriesStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ENDED', 'ARCHIVED');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN "occurrenceDate" TIMESTAMP(3),
ADD COLUMN "seriesId" TEXT;

-- CreateTable
CREATE TABLE "EventTemplate" (
    "id" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "schoolId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "format" "EventFormat" NOT NULL,
    "level" "DanceLevel" NOT NULL DEFAULT 'ALL_LEVELS',
    "cityId" TEXT,
    "venueName" TEXT,
    "venueAddress" TEXT,
    "defaultStartTime" TEXT,
    "defaultEndTime" TEXT,
    "ticketingMode" "EventTicketingMode" NOT NULL DEFAULT 'UNSET',
    "registrationEnabled" BOOLEAN NOT NULL DEFAULT false,
    "capacity" INTEGER,
    "priceText" TEXT,
    "externalLinkUrl" TEXT,
    "tags" TEXT[],
    "certainty" "EventCertainty" NOT NULL DEFAULT 'CONFIRMED',
    "photoUrl" TEXT,
    "typeDetails" JSONB,
    "status" "EventTemplateStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventSeries" (
    "id" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "schoolId" TEXT,
    "organizerName" TEXT,
    "templateId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "format" "EventFormat" NOT NULL,
    "level" "DanceLevel" NOT NULL DEFAULT 'ALL_LEVELS',
    "cityId" TEXT NOT NULL,
    "venueName" TEXT NOT NULL,
    "venueAddress" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Minsk',
    "recurrenceRule" JSONB NOT NULL,
    "defaultStartTime" TEXT NOT NULL,
    "defaultEndTime" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "generationHorizonDays" INTEGER NOT NULL DEFAULT 84,
    "generationThresholdDays" INTEGER NOT NULL DEFAULT 28,
    "autoPublish" BOOLEAN NOT NULL DEFAULT false,
    "publishBeforeMinutes" INTEGER,
    "ticketingMode" "EventTicketingMode" NOT NULL DEFAULT 'UNSET',
    "registrationEnabled" BOOLEAN NOT NULL DEFAULT false,
    "capacity" INTEGER,
    "priceText" TEXT,
    "externalLinkUrl" TEXT,
    "tags" TEXT[],
    "certainty" "EventCertainty" NOT NULL DEFAULT 'CONFIRMED',
    "photoUrl" TEXT,
    "typeDetails" JSONB,
    "status" "EventSeriesStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastGeneratedThrough" TIMESTAMP(3),
    "lastGeneratedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventSeries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventTemplate_createdById_idx" ON "EventTemplate"("createdById");

-- CreateIndex
CREATE INDEX "EventTemplate_schoolId_idx" ON "EventTemplate"("schoolId");

-- CreateIndex
CREATE INDEX "EventTemplate_status_idx" ON "EventTemplate"("status");

-- CreateIndex
CREATE INDEX "EventSeries_createdById_idx" ON "EventSeries"("createdById");

-- CreateIndex
CREATE INDEX "EventSeries_schoolId_idx" ON "EventSeries"("schoolId");

-- CreateIndex
CREATE INDEX "EventSeries_status_lastGeneratedThrough_idx" ON "EventSeries"("status", "lastGeneratedThrough");

-- CreateIndex
CREATE INDEX "Event_seriesId_idx" ON "Event"("seriesId");

-- CreateIndex (идемпотентность генератора — см. src/server/events/series-generation.ts)
CREATE UNIQUE INDEX "Event_seriesId_occurrenceDate_key" ON "Event"("seriesId", "occurrenceDate");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "EventSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventTemplate" ADD CONSTRAINT "EventTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventTemplate" ADD CONSTRAINT "EventTemplate_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventTemplate" ADD CONSTRAINT "EventTemplate_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSeries" ADD CONSTRAINT "EventSeries_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSeries" ADD CONSTRAINT "EventSeries_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSeries" ADD CONSTRAINT "EventSeries_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EventTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSeries" ADD CONSTRAINT "EventSeries_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CheckConstraint (Prisma DSL не поддерживает декларативный CHECK, тот же
-- приём, что уже используется у Ticket_at_most_one_product/
-- PassAccessGrant_exactly_one_target) — seriesId и occurrenceDate должны
-- быть заполнены оба или ни один, иначе идемпотентность генератора
-- (unique-индекс выше) ничего не защищает.
ALTER TABLE "Event" ADD CONSTRAINT "Event_series_occurrence_pair" CHECK (
  ("seriesId" IS NULL AND "occurrenceDate" IS NULL) OR
  ("seriesId" IS NOT NULL AND "occurrenceDate" IS NOT NULL)
);
