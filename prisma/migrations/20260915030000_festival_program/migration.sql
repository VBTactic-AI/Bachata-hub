-- Bachata HUB — Events Engine, этап 6: программа фестиваля.
--
-- FestivalDetails — 1:1 к Event, тот же паттерн, что и PartyDetails/
-- MasterclassDetails (audit_report.md FEST-001). Пропуска/цены — уже
-- существующий EventPriceOption, новой таблицы под них нет. "Преподаватели
-- фестиваля" — производная от EventProgramItem.teacherId, отдельного списка
-- нет (см. комментарий в schema.prisma).

CREATE TYPE "FestivalProgramItemType" AS ENUM ('WORKSHOP', 'PARTY', 'COMPETITION', 'OTHER');

CREATE TABLE "FestivalDetails" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    CONSTRAINT "FestivalDetails_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FestivalDetails_eventId_key" ON "FestivalDetails"("eventId");

ALTER TABLE "FestivalDetails" ADD CONSTRAINT "FestivalDetails_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "EventProgramItem" (
    "id" TEXT NOT NULL,
    "festivalDetailsId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "FestivalProgramItemType" NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "teacherId" TEXT,
    "linkedEventId" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "EventProgramItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EventProgramItem_festivalDetailsId_idx" ON "EventProgramItem"("festivalDetailsId");
CREATE INDEX "EventProgramItem_teacherId_idx" ON "EventProgramItem"("teacherId");
CREATE INDEX "EventProgramItem_linkedEventId_idx" ON "EventProgramItem"("linkedEventId");

ALTER TABLE "EventProgramItem" ADD CONSTRAINT "EventProgramItem_festivalDetailsId_fkey"
    FOREIGN KEY ("festivalDetailsId") REFERENCES "FestivalDetails"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventProgramItem" ADD CONSTRAINT "EventProgramItem_teacherId_fkey"
    FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EventProgramItem" ADD CONSTRAINT "EventProgramItem_linkedEventId_fkey"
    FOREIGN KEY ("linkedEventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FestivalDetails" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EventProgramItem" ENABLE ROW LEVEL SECURITY;
