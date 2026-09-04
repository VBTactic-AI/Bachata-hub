-- Bachata HUB Belarus — слой 3
-- План "сколько пар участвует в каждом этапе" для конкретного дивизиона
-- (docs/00_DECISIONS.md, A14) — задаётся один раз при создании дивизиона,
-- до начала соревнования, дальше не меняется (влияет на расчёт cutoff в
-- Advancement Engine, A13). Заменяет ручной ввод "Сколько проходит дальше"
-- при добавлении отдельного раунда.

CREATE TABLE "DivisionStagePlan" (
    "id" TEXT NOT NULL,
    "divisionId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "participantCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DivisionStagePlan_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DivisionStagePlan_divisionId_stageId_key" ON "DivisionStagePlan"("divisionId", "stageId");
ALTER TABLE "DivisionStagePlan" ADD CONSTRAINT "DivisionStagePlan_divisionId_fkey"
    FOREIGN KEY ("divisionId") REFERENCES "Division"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DivisionStagePlan" ADD CONSTRAINT "DivisionStagePlan_stageId_fkey"
    FOREIGN KEY ("stageId") REFERENCES "RoundStageCatalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DivisionStagePlan" ENABLE ROW LEVEL SECURITY;
