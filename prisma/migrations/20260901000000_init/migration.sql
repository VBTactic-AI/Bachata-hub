-- Bachata HUB Belarus — слой 1
-- Начальная миграция. Сгенерирована вручную по prisma/schema.prisma
-- (эквивалент того, что создаст `npx prisma migrate dev` после `npm install`
-- внутри Docker-контейнера, где есть доступ к сети).

-- ============================== ENUMS =====================================

CREATE TYPE "UserRole" AS ENUM ('GUEST', 'DANCER', 'SCHOOL_REP', 'ORGANIZER', 'MODERATOR', 'ADMIN');
CREATE TYPE "SchoolVerificationStatus" AS ENUM ('COMMUNITY', 'VERIFIED');
CREATE TYPE "Weekday" AS ENUM ('MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN');
CREATE TYPE "DanceLevel" AS ENUM ('BEGINNER', 'ALL_LEVELS', 'ADVANCED');
CREATE TYPE "ClaimStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "EventFormat" AS ENUM ('PARTY', 'MASTERCLASS', 'FESTIVAL', 'CONTEST', 'INTENSIVE');
CREATE TYPE "EventType" AS ENUM ('REGULAR', 'CONTEST');
CREATE TYPE "ModerationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "DanceRole" AS ENUM ('LEADER', 'FOLLOWER', 'BOTH');
CREATE TYPE "AttendanceStatus" AS ENUM ('GOING', 'WENT');
CREATE TYPE "AttendanceSource" AS ENUM ('SELF_REPORTED');
CREATE TYPE "AchievementSource" AS ENUM ('MANUAL', 'CONTEST_RESULT');
CREATE TYPE "ModerationEntity" AS ENUM ('EVENT', 'REVIEW', 'SCHOOL_CLAIM', 'SCHOOL', 'USER');

-- ============================== TABLES ====================================

CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'DANCER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_role_idx" ON "User"("role");

CREATE TABLE "Country" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameRu" TEXT NOT NULL,
    CONSTRAINT "Country_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Country_code_key" ON "Country"("code");

CREATE TABLE "City" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nameRu" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "City_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "City_slug_key" ON "City"("slug");
CREATE INDEX "City_countryId_idx" ON "City"("countryId");

CREATE TABLE "School" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "description" TEXT,
    "directions" TEXT[],
    "levels" "DanceLevel"[],
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "socialLinks" JSONB,
    "verificationStatus" "SchoolVerificationStatus" NOT NULL DEFAULT 'COMMUNITY',
    "ownerUserId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "School_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "School_slug_key" ON "School"("slug");
CREATE INDEX "School_cityId_idx" ON "School"("cityId");
CREATE INDEX "School_verificationStatus_idx" ON "School"("verificationStatus");

CREATE TABLE "SchoolBranch" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "cityId" TEXT,
    CONSTRAINT "SchoolBranch_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SchoolBranch_schoolId_idx" ON "SchoolBranch"("schoolId");

CREATE TABLE "Teacher" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "photoUrl" TEXT,
    "bio" TEXT,
    "schoolId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "Teacher_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Teacher_schoolId_idx" ON "Teacher"("schoolId");

CREATE TABLE "ClassSchedule" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "teacherId" TEXT,
    "weekday" "Weekday" NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT,
    "level" "DanceLevel" NOT NULL,
    "hall" TEXT,
    CONSTRAINT "ClassSchedule_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ClassSchedule_schoolId_idx" ON "ClassSchedule"("schoolId");

CREATE TABLE "SchoolClaim" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "claimantId" TEXT NOT NULL,
    "status" "ClaimStatus" NOT NULL DEFAULT 'PENDING',
    "proofNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewComment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SchoolClaim_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SchoolClaim_schoolId_status_idx" ON "SchoolClaim"("schoolId", "status");
CREATE INDEX "SchoolClaim_claimantId_idx" ON "SchoolClaim"("claimantId");

CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "schoolId" TEXT,
    "organizerName" TEXT,
    "format" "EventFormat" NOT NULL,
    "eventType" "EventType" NOT NULL DEFAULT 'REGULAR',
    "level" "DanceLevel" NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "venueName" TEXT NOT NULL,
    "venueAddress" TEXT,
    "description" TEXT,
    "photoUrl" TEXT,
    "priceText" TEXT,
    "externalLinkUrl" TEXT,
    "tags" TEXT[],
    "moderationStatus" "ModerationStatus" NOT NULL DEFAULT 'PENDING',
    "createdById" TEXT NOT NULL,
    "moderatedById" TEXT,
    "moderatedAt" TIMESTAMP(3),
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Event_slug_key" ON "Event"("slug");
CREATE INDEX "Event_cityId_startsAt_idx" ON "Event"("cityId", "startsAt");
CREATE INDEX "Event_schoolId_idx" ON "Event"("schoolId");
CREATE INDEX "Event_moderationStatus_idx" ON "Event"("moderationStatus");
CREATE INDEX "Event_eventType_idx" ON "Event"("eventType");

CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "moderationStatus" "ModerationStatus" NOT NULL DEFAULT 'APPROVED',
    "moderatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Review_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Review_rating_check" CHECK ("rating" >= 1 AND "rating" <= 5)
);
CREATE INDEX "Review_schoolId_idx" ON "Review"("schoolId");
CREATE INDEX "Review_moderationStatus_idx" ON "Review"("moderationStatus");

CREATE TABLE "Dancer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "cityId" TEXT,
    "danceRole" "DanceRole",
    "selfLevel" "DanceLevel",
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Dancer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Dancer_userId_key" ON "Dancer"("userId");
CREATE INDEX "Dancer_cityId_idx" ON "Dancer"("cityId");

CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL,
    "dancerId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "source" "AttendanceSource" NOT NULL DEFAULT 'SELF_REPORTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Attendance_dancerId_eventId_key" ON "Attendance"("dancerId", "eventId");
CREATE INDEX "Attendance_eventId_idx" ON "Attendance"("eventId");

CREATE TABLE "Achievement" (
    "id" TEXT NOT NULL,
    "dancerId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "achievedAt" TIMESTAMP(3) NOT NULL,
    "source" "AchievementSource" NOT NULL DEFAULT 'MANUAL',
    "eventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Achievement_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Achievement_dancerId_idx" ON "Achievement"("dancerId");

CREATE TABLE "ModerationLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "entity" "ModerationEntity" NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ModerationLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ModerationLog_entity_entityId_idx" ON "ModerationLog"("entity", "entityId");
CREATE INDEX "ModerationLog_actorId_idx" ON "ModerationLog"("actorId");

-- ============================== FOREIGN KEYS ===============================

ALTER TABLE "City" ADD CONSTRAINT "City_countryId_fkey"
    FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "School" ADD CONSTRAINT "School_cityId_fkey"
    FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "School" ADD CONSTRAINT "School_ownerUserId_fkey"
    FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SchoolBranch" ADD CONSTRAINT "SchoolBranch_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolBranch" ADD CONSTRAINT "SchoolBranch_cityId_fkey"
    FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Teacher" ADD CONSTRAINT "Teacher_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ClassSchedule" ADD CONSTRAINT "ClassSchedule_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClassSchedule" ADD CONSTRAINT "ClassSchedule_teacherId_fkey"
    FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SchoolClaim" ADD CONSTRAINT "SchoolClaim_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolClaim" ADD CONSTRAINT "SchoolClaim_claimantId_fkey"
    FOREIGN KEY ("claimantId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SchoolClaim" ADD CONSTRAINT "SchoolClaim_reviewedById_fkey"
    FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Event" ADD CONSTRAINT "Event_cityId_fkey"
    FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Event" ADD CONSTRAINT "Event_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Event" ADD CONSTRAINT "Event_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Event" ADD CONSTRAINT "Event_moderatedById_fkey"
    FOREIGN KEY ("moderatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Review" ADD CONSTRAINT "Review_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Review" ADD CONSTRAINT "Review_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Review" ADD CONSTRAINT "Review_moderatedById_fkey"
    FOREIGN KEY ("moderatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Dancer" ADD CONSTRAINT "Dancer_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Dancer" ADD CONSTRAINT "Dancer_cityId_fkey"
    FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_dancerId_fkey"
    FOREIGN KEY ("dancerId") REFERENCES "Dancer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Achievement" ADD CONSTRAINT "Achievement_dancerId_fkey"
    FOREIGN KEY ("dancerId") REFERENCES "Dancer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Achievement" ADD CONSTRAINT "Achievement_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ModerationLog" ADD CONSTRAINT "ModerationLog_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
