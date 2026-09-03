-- Bachata HUB Belarus — слой 3, этап 1 (фундамент движка Jack & Jill)
-- Только новые ENUM/таблицы: RBAC, соревнование/дивизион/правила,
-- раунды/заезды, аудит/идемпотентность. Ни одна существующая таблица не
-- меняется (см. docs/00_DECISIONS.md).
-- Сгенерирована вручную по prisma/schema.prisma — см. комментарий в
-- 20260901000000_init/migration.sql о причине (нет прямого сетевого доступа
-- к shadow-БД для `prisma migrate dev` из этого окружения).

-- ============================== ENUMS =====================================

CREATE TYPE "CompetitionStatus" AS ENUM ('DRAFT', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'CHECK_IN', 'READY', 'LIVE', 'SCORING', 'REVIEW', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "RoundStatus" AS ENUM ('DRAFT', 'READY', 'DRAWING', 'DRAW_LOCKED', 'RUNNING', 'PAUSED', 'FINISHED', 'SCORING', 'COMPLETED');
CREATE TYPE "HeatStatus" AS ENUM ('PENDING', 'RUNNING', 'PAUSED', 'FINISHED');
CREATE TYPE "RoundType" AS ENUM ('PRELIMINARY', 'CALLBACK', 'QUARTERFINAL', 'SEMIFINAL', 'FINAL', 'TIE_BREAK', 'DANCE_OFF');
CREATE TYPE "DivisionLevel" AS ENUM ('NOVICE', 'INTERMEDIATE', 'ADVANCED', 'OPEN', 'INVITATIONAL', 'CUSTOM');
CREATE TYPE "RoleScope" AS ENUM ('GLOBAL', 'COMPETITION');

-- ============================== TABLES ====================================

CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Permission_code_key" ON "Permission"("code");

CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scope" "RoleScope" NOT NULL,
    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Role_code_key" ON "Role"("code");

CREATE TABLE "RolePermission" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RolePermission_roleId_permissionId_key" ON "RolePermission"("roleId", "permissionId");
CREATE INDEX "RolePermission_permissionId_idx" ON "RolePermission"("permissionId");

CREATE TABLE "UserRoleAssignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantedById" TEXT,
    CONSTRAINT "UserRoleAssignment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UserRoleAssignment_userId_roleId_key" ON "UserRoleAssignment"("userId", "roleId");
CREATE INDEX "UserRoleAssignment_userId_idx" ON "UserRoleAssignment"("userId");

CREATE TABLE "CompetitionTemplate" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "rules" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "CompetitionTemplate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CompetitionTemplate_code_key" ON "CompetitionTemplate"("code");

CREATE TABLE "Competition" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "organizerName" TEXT,
    "venue" TEXT,
    "cityId" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Minsk',
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "status" "CompetitionStatus" NOT NULL DEFAULT 'DRAFT',
    "statusVersion" INTEGER NOT NULL DEFAULT 1,
    "templateId" TEXT,
    "eventId" TEXT,
    "publicResults" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Competition_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Competition_slug_key" ON "Competition"("slug");
CREATE UNIQUE INDEX "Competition_eventId_key" ON "Competition"("eventId");
CREATE INDEX "Competition_status_idx" ON "Competition"("status");
CREATE INDEX "Competition_cityId_idx" ON "Competition"("cityId");

CREATE TABLE "CompetitionMember" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "addedById" TEXT,
    CONSTRAINT "CompetitionMember_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CompetitionMember_competitionId_userId_roleId_key" ON "CompetitionMember"("competitionId", "userId", "roleId");
CREATE INDEX "CompetitionMember_competitionId_idx" ON "CompetitionMember"("competitionId");
CREATE INDEX "CompetitionMember_userId_idx" ON "CompetitionMember"("userId");

CREATE TABLE "CompetitionRules" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "rules" JSONB NOT NULL,
    "lockedAt" TIMESTAMP(3),
    "lockedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompetitionRules_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CompetitionRules_competitionId_version_key" ON "CompetitionRules"("competitionId", "version");
CREATE INDEX "CompetitionRules_competitionId_idx" ON "CompetitionRules"("competitionId");

CREATE TABLE "Division" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" "DivisionLevel" NOT NULL,
    "minAge" INTEGER,
    "maxAge" INTEGER,
    "maxParticipants" INTEGER,
    "rules" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Division_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Division_competitionId_name_key" ON "Division"("competitionId", "name");

CREATE TABLE "Round" (
    "id" TEXT NOT NULL,
    "divisionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "RoundType" NOT NULL,
    "order" INTEGER NOT NULL,
    "status" "RoundStatus" NOT NULL DEFAULT 'DRAFT',
    "statusVersion" INTEGER NOT NULL DEFAULT 1,
    "finalistsCount" INTEGER,
    "config" JSONB NOT NULL DEFAULT '{}',
    "rulesId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Round_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Round_divisionId_order_key" ON "Round"("divisionId", "order");
CREATE INDEX "Round_status_idx" ON "Round"("status");

CREATE TABLE "Heat" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "status" "HeatStatus" NOT NULL DEFAULT 'PENDING',
    "statusVersion" INTEGER NOT NULL DEFAULT 1,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    CONSTRAINT "Heat_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Heat_roundId_number_key" ON "Heat"("roundId", "number");

CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

CREATE TABLE "CompetitionEvent" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT,
    "roundId" TEXT,
    "heatId" TEXT,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT,
    CONSTRAINT "CompetitionEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CompetitionEvent_competitionId_occurredAt_idx" ON "CompetitionEvent"("competitionId", "occurredAt");

CREATE TABLE "IdempotencyKey" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IdempotencyKey_scope_key_key" ON "IdempotencyKey"("scope", "key");

-- ============================== FOREIGN KEYS ===============================

ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey"
    FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey"
    FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserRoleAssignment" ADD CONSTRAINT "UserRoleAssignment_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserRoleAssignment" ADD CONSTRAINT "UserRoleAssignment_roleId_fkey"
    FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserRoleAssignment" ADD CONSTRAINT "UserRoleAssignment_grantedById_fkey"
    FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Competition" ADD CONSTRAINT "Competition_cityId_fkey"
    FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Competition" ADD CONSTRAINT "Competition_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "CompetitionTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Competition" ADD CONSTRAINT "Competition_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Competition" ADD CONSTRAINT "Competition_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CompetitionMember" ADD CONSTRAINT "CompetitionMember_competitionId_fkey"
    FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompetitionMember" ADD CONSTRAINT "CompetitionMember_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompetitionMember" ADD CONSTRAINT "CompetitionMember_roleId_fkey"
    FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CompetitionMember" ADD CONSTRAINT "CompetitionMember_addedById_fkey"
    FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CompetitionRules" ADD CONSTRAINT "CompetitionRules_competitionId_fkey"
    FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompetitionRules" ADD CONSTRAINT "CompetitionRules_lockedById_fkey"
    FOREIGN KEY ("lockedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Division" ADD CONSTRAINT "Division_competitionId_fkey"
    FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Round" ADD CONSTRAINT "Round_divisionId_fkey"
    FOREIGN KEY ("divisionId") REFERENCES "Division"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Round" ADD CONSTRAINT "Round_rulesId_fkey"
    FOREIGN KEY ("rulesId") REFERENCES "CompetitionRules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Heat" ADD CONSTRAINT "Heat_roundId_fkey"
    FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CompetitionEvent" ADD CONSTRAINT "CompetitionEvent_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
