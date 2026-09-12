-- Event Engine foundation (слой 1): универсальный движок создания событий.
-- status разделяет "черновик мастера" (EventStatus) и "решение модератора"
-- (уже существующий moderationStatus) — раньше второго было достаточно,
-- теперь Event может существовать как невидимый черновик ДО отправки на
-- модерацию. Существующие строки получают DRAFT->PUBLISHED по умолчанию,
-- их видимость как и раньше зависит только от moderationStatus.
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

ALTER TABLE "Event" ADD COLUMN "status" "EventStatus" NOT NULL DEFAULT 'PUBLISHED';
ALTER TABLE "Event" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "Event" ADD COLUMN "longitude" DOUBLE PRECISION;
ALTER TABLE "Event" ADD COLUMN "capacity" INTEGER;
ALTER TABLE "Event" ADD COLUMN "registrationEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Event_status_idx" ON "Event"("status");

-- Варианты цены/билета — общие для PARTY и MASTERCLASS.
CREATE TABLE "EventPriceOption" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "price" DECIMAL(10,2),
    "currency" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventPriceOption_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EventPriceOption_eventId_idx" ON "EventPriceOption"("eventId");
ALTER TABLE "EventPriceOption" ADD CONSTRAINT "EventPriceOption_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventPriceOption" ENABLE ROW LEVEL SECURITY;

-- Party-специфичные поля, 1:1 к Event.
CREATE TABLE "PartyDetails" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "musicStyles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "djs" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "danceFloors" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "artists" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "dressCode" TEXT,
    "photographer" TEXT,
    "foodAndDrinks" TEXT,
    "parking" BOOLEAN,
    "cloakroom" BOOLEAN,

    CONSTRAINT "PartyDetails_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PartyDetails_eventId_key" ON "PartyDetails"("eventId");
ALTER TABLE "PartyDetails" ADD CONSTRAINT "PartyDetails_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PartyDetails" ENABLE ROW LEVEL SECURITY;

-- Masterclass-специфичные поля, 1:1 к Event.
CREATE TABLE "MasterclassDetails" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "style" TEXT,
    "format" TEXT,
    "partnerRequired" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MasterclassDetails_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MasterclassDetails_eventId_key" ON "MasterclassDetails"("eventId");
ALTER TABLE "MasterclassDetails" ADD CONSTRAINT "MasterclassDetails_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MasterclassDetails" ENABLE ROW LEVEL SECURITY;

-- Сессии мастер-класса ("+ Add Session"). teacherId ссылается на уже
-- существующую Teacher — не заводим отдельную сущность "инструктор".
CREATE TABLE "MasterclassSession" (
    "id" TEXT NOT NULL,
    "masterclassDetailsId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "teacherId" TEXT,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "room" TEXT,
    "level" "DanceLevel",
    "capacity" INTEGER,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MasterclassSession_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MasterclassSession_masterclassDetailsId_idx" ON "MasterclassSession"("masterclassDetailsId");
CREATE INDEX "MasterclassSession_teacherId_idx" ON "MasterclassSession"("teacherId");
ALTER TABLE "MasterclassSession" ADD CONSTRAINT "MasterclassSession_masterclassDetailsId_fkey" FOREIGN KEY ("masterclassDetailsId") REFERENCES "MasterclassDetails"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MasterclassSession" ADD CONSTRAINT "MasterclassSession_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MasterclassSession" ENABLE ROW LEVEL SECURITY;
