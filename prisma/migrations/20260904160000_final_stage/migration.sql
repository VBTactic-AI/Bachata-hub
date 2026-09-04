-- Bachata HUB Belarus — слой 3
-- Финал (Этап 9, docs/00_DECISIONS.md, A21).
--
-- Судейство финала — отдельная от обычной (JudgeScore) система: несколько
-- КРИТЕРИЕВ со своим диапазоном каждый, а не одна оценка 0..judgingMaxScore.
-- "Приоритет" критерия — НЕ коэффициент: оценки не умножаются и не
-- нормализуются, общая сумма всегда простая арифметическая сумма. priority
-- используется ТОЛЬКО как порядок сравнения критериев при полном равенстве
-- общей суммы (лексикографический tie-break) — подтверждено пользователем
-- явно, 2026-09-04. Переиспользует Round/Heat/Draw/DrawParticipant (вызов на
-- паркет) и JudgeAssignment (судья закреплён на роль) как есть.

CREATE TYPE "FinalFormat" AS ENUM ('NORMAL', 'JUDGES_DANCE', 'RANDOM_COUPLES');

CREATE TABLE "FinalCriterion" (
    "id" TEXT NOT NULL,
    "divisionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priority" INTEGER NOT NULL,
    "minScore" INTEGER NOT NULL,
    "maxScore" INTEGER NOT NULL,
    "step" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinalCriterion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FinalCriterion_divisionId_priority_key" ON "FinalCriterion"("divisionId", "priority");
ALTER TABLE "FinalCriterion" ADD CONSTRAINT "FinalCriterion_divisionId_fkey"
    FOREIGN KEY ("divisionId") REFERENCES "Division"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "FinalSettings" (
    "id" TEXT NOT NULL,
    "divisionId" TEXT NOT NULL,
    "format" "FinalFormat" NOT NULL DEFAULT 'NORMAL',
    "tracksCount" INTEGER NOT NULL DEFAULT 1,
    "partnerChangeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FinalSettings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FinalSettings_divisionId_key" ON "FinalSettings"("divisionId");
ALTER TABLE "FinalSettings" ADD CONSTRAINT "FinalSettings_divisionId_fkey"
    FOREIGN KEY ("divisionId") REFERENCES "Division"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "FinalSession" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "format" "FinalFormat" NOT NULL,
    "criteriaSnapshot" JSONB NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "currentStage" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "FinalSession_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FinalSession_roundId_key" ON "FinalSession"("roundId");
ALTER TABLE "FinalSession" ADD CONSTRAINT "FinalSession_roundId_fkey"
    FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "FinalPair" (
    "id" TEXT NOT NULL,
    "finalSessionId" TEXT NOT NULL,
    "heatId" TEXT NOT NULL,
    "pairNumber" INTEGER NOT NULL,
    "leaderRegistrationId" TEXT NOT NULL,
    "followerRegistrationId" TEXT NOT NULL,
    "trackName" TEXT,
    "seed" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinalPair_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FinalPair_heatId_key" ON "FinalPair"("heatId");
CREATE UNIQUE INDEX "FinalPair_finalSessionId_pairNumber_key" ON "FinalPair"("finalSessionId", "pairNumber");
ALTER TABLE "FinalPair" ADD CONSTRAINT "FinalPair_finalSessionId_fkey"
    FOREIGN KEY ("finalSessionId") REFERENCES "FinalSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinalPair" ADD CONSTRAINT "FinalPair_heatId_fkey"
    FOREIGN KEY ("heatId") REFERENCES "Heat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinalPair" ADD CONSTRAINT "FinalPair_leaderRegistrationId_fkey"
    FOREIGN KEY ("leaderRegistrationId") REFERENCES "Registration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinalPair" ADD CONSTRAINT "FinalPair_followerRegistrationId_fkey"
    FOREIGN KEY ("followerRegistrationId") REFERENCES "Registration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinalPair" ADD CONSTRAINT "FinalPair_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "FinalJudgeScore" (
    "id" TEXT NOT NULL,
    "drawParticipantId" TEXT NOT NULL,
    "judgeAssignmentId" TEXT NOT NULL,
    "criterionId" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "clientSubmissionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FinalJudgeScore_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FinalJudgeScore_dp_ja_criterion_key"
    ON "FinalJudgeScore"("drawParticipantId", "judgeAssignmentId", "criterionId");
ALTER TABLE "FinalJudgeScore" ADD CONSTRAINT "FinalJudgeScore_drawParticipantId_fkey"
    FOREIGN KEY ("drawParticipantId") REFERENCES "DrawParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinalJudgeScore" ADD CONSTRAINT "FinalJudgeScore_judgeAssignmentId_fkey"
    FOREIGN KEY ("judgeAssignmentId") REFERENCES "JudgeAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinalJudgeScore" ADD CONSTRAINT "FinalJudgeScore_criterionId_fkey"
    FOREIGN KEY ("criterionId") REFERENCES "FinalCriterion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "FinalResult" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "finalSessionId" TEXT NOT NULL,
    "role" "RegistrationRole" NOT NULL,
    "totalScore" INTEGER NOT NULL,
    "criteriaTotals" JSONB NOT NULL,
    "place" INTEGER,
    "tieGroupKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FinalResult_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FinalResult_roundId_registrationId_key" ON "FinalResult"("roundId", "registrationId");
ALTER TABLE "FinalResult" ADD CONSTRAINT "FinalResult_roundId_fkey"
    FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinalResult" ADD CONSTRAINT "FinalResult_registrationId_fkey"
    FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinalResult" ADD CONSTRAINT "FinalResult_finalSessionId_fkey"
    FOREIGN KEY ("finalSessionId") REFERENCES "FinalSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FinalCriterion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FinalSettings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FinalSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FinalPair" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FinalJudgeScore" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FinalResult" ENABLE ROW LEVEL SECURITY;
