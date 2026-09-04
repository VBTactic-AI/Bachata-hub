-- Судья явно подтверждает "Готово" по раунду (формат "Да/Нет") — раунд
-- завершается, только когда так подтвердили все судьи (CLAUDE.md §17,
-- docs/00_DECISIONS.md, 2026-09-04).
CREATE TABLE "JudgeRoundConfirmation" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "judgeAssignmentId" TEXT NOT NULL,
    "yesCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JudgeRoundConfirmation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "JudgeRoundConfirmation_roundId_judgeAssignmentId_key" ON "JudgeRoundConfirmation"("roundId", "judgeAssignmentId");

ALTER TABLE "JudgeRoundConfirmation" ADD CONSTRAINT "JudgeRoundConfirmation_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "JudgeRoundConfirmation" ADD CONSTRAINT "JudgeRoundConfirmation_judgeAssignmentId_fkey" FOREIGN KEY ("judgeAssignmentId") REFERENCES "JudgeAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "JudgeRoundConfirmation" ENABLE ROW LEVEL SECURITY;
