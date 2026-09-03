-- Bachata HUB Belarus — слой 3, этап 3 (регистрация и check-in)
-- Только новые ENUM/таблицы. Competitor как отдельная сущность не заводится:
-- аккаунт обязателен для участия, регистрация ссылается напрямую на
-- существующий layer-1 Dancer (см. docs/00_DECISIONS.md).

CREATE TYPE "RegistrationRole" AS ENUM ('LEADER', 'FOLLOWER');
CREATE TYPE "RegistrationStatus" AS ENUM ('REGISTERED', 'SCRATCHED', 'DISQUALIFIED');
CREATE TYPE "CheckInStatus" AS ENUM ('CHECKED_IN', 'LATE', 'NO_SHOW');

CREATE TABLE "Registration" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "divisionId" TEXT NOT NULL,
    "dancerId" TEXT NOT NULL,
    "role" "RegistrationRole" NOT NULL,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'REGISTERED',
    "registeredById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Registration_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Registration_competitionId_divisionId_dancerId_key" ON "Registration"("competitionId", "divisionId", "dancerId");
CREATE INDEX "Registration_competitionId_divisionId_idx" ON "Registration"("competitionId", "divisionId");
CREATE INDEX "Registration_dancerId_idx" ON "Registration"("dancerId");

CREATE TABLE "CheckIn" (
    "id" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "status" "CheckInStatus" NOT NULL,
    "bibNumber" TEXT,
    "checkedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkedInById" TEXT NOT NULL,
    CONSTRAINT "CheckIn_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CheckIn_registrationId_key" ON "CheckIn"("registrationId");
CREATE UNIQUE INDEX "CheckIn_competitionId_bibNumber_key" ON "CheckIn"("competitionId", "bibNumber");
CREATE INDEX "CheckIn_registrationId_idx" ON "CheckIn"("registrationId");

ALTER TABLE "Registration" ADD CONSTRAINT "Registration_competitionId_fkey"
    FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_divisionId_fkey"
    FOREIGN KEY ("divisionId") REFERENCES "Division"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_dancerId_fkey"
    FOREIGN KEY ("dancerId") REFERENCES "Dancer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_registeredById_fkey"
    FOREIGN KEY ("registeredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_registrationId_fkey"
    FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_competitionId_fkey"
    FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_checkedInById_fkey"
    FOREIGN KEY ("checkedInById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Registration" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CheckIn" ENABLE ROW LEVEL SECURITY;
