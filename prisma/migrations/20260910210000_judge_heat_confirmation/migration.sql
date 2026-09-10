-- Подтверждение "Готово" по заходу (только JUDGES_DANCE, см. комментарий
-- у модели в schema.prisma) — раньше единственным механизмом было
-- JudgeRoundConfirmation "на весь раунд", что ломалось для JUDGES_DANCE:
-- заходы стадий там появляются не все сразу.
CREATE TABLE "JudgeHeatConfirmation" (
    "id" TEXT NOT NULL,
    "heatId" TEXT NOT NULL,
    "judgeAssignmentId" TEXT NOT NULL,
    "yesCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JudgeHeatConfirmation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "JudgeHeatConfirmation_heatId_judgeAssignmentId_key" ON "JudgeHeatConfirmation"("heatId", "judgeAssignmentId");

CREATE INDEX "JudgeHeatConfirmation_judgeAssignmentId_idx" ON "JudgeHeatConfirmation"("judgeAssignmentId");

ALTER TABLE "JudgeHeatConfirmation" ADD CONSTRAINT "JudgeHeatConfirmation_heatId_fkey" FOREIGN KEY ("heatId") REFERENCES "Heat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "JudgeHeatConfirmation" ADD CONSTRAINT "JudgeHeatConfirmation_judgeAssignmentId_fkey" FOREIGN KEY ("judgeAssignmentId") REFERENCES "JudgeAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "JudgeHeatConfirmation" ENABLE ROW LEVEL SECURITY;
