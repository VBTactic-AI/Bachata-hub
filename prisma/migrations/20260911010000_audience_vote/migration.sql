-- Bachata HUB Belarus — слой 3
-- Приз зрительских симпатий (Audience Vote) — отдельная от судейского
-- движка подсистема голосования, по одной на Division. Жизненный цикл
-- ЛИНЕЙНЫЙ, без повторного открытия: IDLE -> RUNNING -> CLOSED -> PUBLISHED
-- (и обратно в CLOSED только через явный Unpublish с причиной, как у
-- Result/unpublishCompetitionResults). См. план реализации
-- whimsical-juggling-thompson.md — согласован с пользователем 2026-09-11.

CREATE TYPE "AudienceVoteMode" AS ENUM ('GENERAL', 'BY_ROLE');
CREATE TYPE "AudienceVoteDisplayMode" AS ENUM ('NUMBER_ONLY', 'NUMBER_AND_NAME');
CREATE TYPE "AudienceVoteStatus" AS ENUM ('IDLE', 'RUNNING', 'CLOSED', 'PUBLISHED');
CREATE TYPE "AudienceVoteRole" AS ENUM ('LEADER', 'FOLLOWER', 'ANY');

CREATE TABLE "AudienceVote" (
    "id" TEXT NOT NULL,
    "divisionId" TEXT NOT NULL,
    "mode" "AudienceVoteMode" NOT NULL,
    "displayMode" "AudienceVoteDisplayMode" NOT NULL DEFAULT 'NUMBER_AND_NAME',
    "infoText" TEXT,
    "status" "AudienceVoteStatus" NOT NULL DEFAULT 'IDLE',
    "statusVersion" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "startedById" TEXT,
    "closesAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "publishedAt" TIMESTAMP(3),
    "publishedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AudienceVote_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AudienceVote_divisionId_key" ON "AudienceVote"("divisionId");
ALTER TABLE "AudienceVote" ADD CONSTRAINT "AudienceVote_divisionId_fkey"
    FOREIGN KEY ("divisionId") REFERENCES "Division"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AudienceVote" ADD CONSTRAINT "AudienceVote_startedById_fkey"
    FOREIGN KEY ("startedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AudienceVote" ADD CONSTRAINT "AudienceVote_closedById_fkey"
    FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AudienceVote" ADD CONSTRAINT "AudienceVote_publishedById_fkey"
    FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "AudienceVoteBallot" (
    "id" TEXT NOT NULL,
    "audienceVoteId" TEXT NOT NULL,
    "voterUserId" TEXT NOT NULL,
    "role" "AudienceVoteRole" NOT NULL,
    "registrationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AudienceVoteBallot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AudienceVoteBallot_audienceVoteId_voterUserId_role_key" ON "AudienceVoteBallot"("audienceVoteId", "voterUserId", "role");
CREATE INDEX "AudienceVoteBallot_audienceVoteId_registrationId_idx" ON "AudienceVoteBallot"("audienceVoteId", "registrationId");
ALTER TABLE "AudienceVoteBallot" ADD CONSTRAINT "AudienceVoteBallot_audienceVoteId_fkey"
    FOREIGN KEY ("audienceVoteId") REFERENCES "AudienceVote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AudienceVoteBallot" ADD CONSTRAINT "AudienceVoteBallot_voterUserId_fkey"
    FOREIGN KEY ("voterUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AudienceVoteBallot" ADD CONSTRAINT "AudienceVoteBallot_registrationId_fkey"
    FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AudienceVoteWinner" (
    "id" TEXT NOT NULL,
    "audienceVoteId" TEXT NOT NULL,
    "role" "AudienceVoteRole" NOT NULL,
    "registrationId" TEXT NOT NULL,
    "voteCount" INTEGER NOT NULL,
    "confirmedById" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AudienceVoteWinner_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AudienceVoteWinner_audienceVoteId_role_registrationId_key" ON "AudienceVoteWinner"("audienceVoteId", "role", "registrationId");
CREATE INDEX "AudienceVoteWinner_registrationId_idx" ON "AudienceVoteWinner"("registrationId");
ALTER TABLE "AudienceVoteWinner" ADD CONSTRAINT "AudienceVoteWinner_audienceVoteId_fkey"
    FOREIGN KEY ("audienceVoteId") REFERENCES "AudienceVote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AudienceVoteWinner" ADD CONSTRAINT "AudienceVoteWinner_registrationId_fkey"
    FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AudienceVoteWinner" ADD CONSTRAINT "AudienceVoteWinner_confirmedById_fkey"
    FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Видимость приза зрительских симпатий на публичном профиле танцора
-- (/dancers/[id]) остальным посетителям — по умолчанию выключена; самому
-- танцору и SUPER_ADMIN приз виден всегда, независимо от этого поля.
ALTER TABLE "Dancer" ADD COLUMN "showAudienceAwardsPublicly" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "AudienceVote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AudienceVoteBallot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AudienceVoteWinner" ENABLE ROW LEVEL SECURITY;
