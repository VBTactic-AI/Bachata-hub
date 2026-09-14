-- Bachata HUB — Events Engine, этап 5: совместное управление событием.
--
-- Минимальная RBAC-модель — OWNER не хранится строкой, это уже существующий
-- Event.createdById (тот же паттерн, что и School.ownerUserId). Здесь —
-- дополнительные люди, подключённые владельцем к событию.

CREATE TYPE "EventTeamRole" AS ENUM ('MANAGER', 'EDITOR', 'CHECK_IN', 'FINANCE');

CREATE TABLE "EventTeamMember" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "EventTeamRole" NOT NULL,
    "invitedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventTeamMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventTeamMember_eventId_userId_key" ON "EventTeamMember"("eventId", "userId");
CREATE INDEX "EventTeamMember_eventId_idx" ON "EventTeamMember"("eventId");
CREATE INDEX "EventTeamMember_userId_idx" ON "EventTeamMember"("userId");

ALTER TABLE "EventTeamMember" ADD CONSTRAINT "EventTeamMember_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventTeamMember" ADD CONSTRAINT "EventTeamMember_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON UPDATE CASCADE;
ALTER TABLE "EventTeamMember" ADD CONSTRAINT "EventTeamMember_invitedById_fkey"
    FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON UPDATE CASCADE;

ALTER TABLE "EventTeamMember" ENABLE ROW LEVEL SECURITY;
