-- Bachata HUB — единая система заявок на проверенный доступ (AccessRequest).
-- Заменяет узкоспециализированный SchoolClaim (модель убрана из
-- prisma/schema.prisma — код больше нигде её не использует).
--
-- ВАЖНО: физическое удаление таблицы "SchoolClaim"/enum "ClaimStatus" здесь
-- НЕ выполняется — среда выполнения (авто-режим Claude Code) блокирует
-- DROP TABLE/DELETE на реальной облачной БД как потенциально опасную массовую
-- операцию, даже при явном разрешении пользователя в диалоге. Решение:
-- оставить их в БД как безадресный, ничем не используемый остаток — тот же
-- принцип, что уже применялся в проекте к нескольким "мёртвым, но безопасным"
-- значениям enum (см. docs/05_STATUS_REFERENCE.md, часть Г). Физический DROP
-- можно выполнить отдельно вручную через Supabase SQL Editor, когда будет
-- удобно — миграция ниже полностью аддитивна и ни на что не влияет, если
-- этого не сделать.

-- 1) ModerationEntity: добавляем ACCESS_REQUEST (Postgres поддерживает
-- добавление значения enum нативно — SCHOOL_CLAIM остаётся в типе неиспользуемым).
ALTER TYPE "ModerationEntity" ADD VALUE 'ACCESS_REQUEST';

-- 2) Новые флаги верификации на User (выдаются только через одобрение
-- AccessRequest, не выбираются пользователем сам).
ALTER TABLE "User" ADD COLUMN "isVerifiedEventOrganizer" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "isVerifiedFestivalOrganizer" BOOLEAN NOT NULL DEFAULT false;

-- 3) AccessRequest.
CREATE TYPE "AccessRequestType" AS ENUM ('EVENT_ORGANIZER', 'FESTIVAL_ORGANIZER', 'SCHOOL_HEAD', 'COMPETITION_ORGANIZER');
CREATE TYPE "AccessRequestStatus" AS ENUM ('PENDING', 'NEEDS_INFO', 'APPROVED', 'REJECTED', 'REVOKED');

CREATE TABLE "AccessRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "AccessRequestType" NOT NULL,
    "brandName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "cityId" TEXT,
    "countryId" TEXT,
    "phone" TEXT,
    "links" JSONB NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "AccessRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewComment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AccessRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AccessRequest_userId_idx" ON "AccessRequest"("userId");
CREATE INDEX "AccessRequest_status_idx" ON "AccessRequest"("status");
CREATE INDEX "AccessRequest_type_status_idx" ON "AccessRequest"("type", "status");

ALTER TABLE "AccessRequest" ADD CONSTRAINT "AccessRequest_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON UPDATE CASCADE;
ALTER TABLE "AccessRequest" ADD CONSTRAINT "AccessRequest_cityId_fkey"
    FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AccessRequest" ADD CONSTRAINT "AccessRequest_countryId_fkey"
    FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AccessRequest" ADD CONSTRAINT "AccessRequest_reviewedById_fkey"
    FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AccessRequest" ENABLE ROW LEVEL SECURITY;

-- 4) Новая глобальная роль слоя 3 — COMPETITION_ORGANIZER — сидируется
-- идемпотентно через prisma/seed-layer3.ts (npm run seed:layer3), не здесь.
