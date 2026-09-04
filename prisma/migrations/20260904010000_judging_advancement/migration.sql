-- Bachata HUB Belarus — слой 3
-- Судейство (Этап 7) + определение проходящих / перетанцовка (Этап 8),
-- по запросу пользователя 2026-09-04 (см. docs/00_DECISIONS.md).
--
-- Судья закреплён на дивизион и РОЛЬ (LEADER/FOLLOWER), не на пол участника
-- — уточнение прежней формулировки A6. Оценка — 0..judgingMaxScore
-- (1 = 0/1 "проходит/не проходит", 2 = 0/1/2), сумма по судьям, top-N
-- (Round.finalistsCount) проходят дальше. Ничья на границе cutoff — не
-- решается автоматически (CLAUDE.md §19-20): создаётся служебный Round
-- (type=TIE_BREAK) с заходом из спорных участников, решение вносится
-- вручную (HEAD_JUDGE/EVENT_ADMIN выбирает ровно N прошедших).

ALTER TABLE "Round" ADD COLUMN "judgingMaxScore" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Round" ADD COLUMN "tieBreakOfRoundId" TEXT;
ALTER TABLE "Round" ADD CONSTRAINT "Round_tieBreakOfRoundId_fkey"
    FOREIGN KEY ("tieBreakOfRoundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TYPE "AdvancementStatus" AS ENUM ('ADVANCED', 'ELIMINATED', 'TIE_BREAK_REQUIRED');

CREATE TABLE "JudgeAssignment" (
    "id" TEXT NOT NULL,
    "divisionId" TEXT NOT NULL,
    "judgeUserId" TEXT NOT NULL,
    "role" "RegistrationRole" NOT NULL,
    "assignedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JudgeAssignment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "JudgeAssignment_divisionId_judgeUserId_role_key" ON "JudgeAssignment"("divisionId", "judgeUserId", "role");
ALTER TABLE "JudgeAssignment" ADD CONSTRAINT "JudgeAssignment_divisionId_fkey"
    FOREIGN KEY ("divisionId") REFERENCES "Division"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JudgeAssignment" ADD CONSTRAINT "JudgeAssignment_judgeUserId_fkey"
    FOREIGN KEY ("judgeUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JudgeAssignment" ADD CONSTRAINT "JudgeAssignment_assignedById_fkey"
    FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "JudgeScore" (
    "id" TEXT NOT NULL,
    "drawParticipantId" TEXT NOT NULL,
    "judgeAssignmentId" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "maxValue" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "JudgeScore_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "JudgeScore_drawParticipantId_judgeAssignmentId_key" ON "JudgeScore"("drawParticipantId", "judgeAssignmentId");
ALTER TABLE "JudgeScore" ADD CONSTRAINT "JudgeScore_drawParticipantId_fkey"
    FOREIGN KEY ("drawParticipantId") REFERENCES "DrawParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JudgeScore" ADD CONSTRAINT "JudgeScore_judgeAssignmentId_fkey"
    FOREIGN KEY ("judgeAssignmentId") REFERENCES "JudgeAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "RoundResult" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "scoreSum" INTEGER NOT NULL,
    "rank" INTEGER NOT NULL,
    "status" "AdvancementStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RoundResult_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RoundResult_roundId_registrationId_key" ON "RoundResult"("roundId", "registrationId");
ALTER TABLE "RoundResult" ADD CONSTRAINT "RoundResult_roundId_fkey"
    FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoundResult" ADD CONSTRAINT "RoundResult_registrationId_fkey"
    FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "JudgeAssignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "JudgeScore" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RoundResult" ENABLE ROW LEVEL SECURITY;
