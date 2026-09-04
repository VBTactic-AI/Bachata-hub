-- Bachata HUB Belarus — слой 3
-- Результаты и публикация (Этап 10, docs/00_DECISIONS.md).
--
-- Два независимых механизма публикации (уточнено пользователем, 2026-09-04):
-- 1. Списки "кто прошёл дальше" по каждому раунду — публикуются сразу после
--    завершения раунда (Round.advancementPublishedAt/By).
-- 2. Официальные финальные места (Result) — считаются/проверяются по
--    дивизиону, но публикуются РАЗОМ по всему соревнованию через
--    Competition.publicResults (уже существующее поле, заведено на Этапе 1,
--    до этой миграции не использовалось).
-- Result версионируется, как Draw/CompetitionRules — исправление создаёт
-- новую строку, не переписывает существующую (CLAUDE.md §51).

CREATE TYPE "ResultStatus" AS ENUM ('FINALIST', 'ELIMINATED');

ALTER TABLE "Division" ADD COLUMN "resultsReviewedAt" TIMESTAMP(3);
ALTER TABLE "Division" ADD COLUMN "resultsReviewedById" TEXT;
ALTER TABLE "Division" ADD CONSTRAINT "Division_resultsReviewedById_fkey"
    FOREIGN KEY ("resultsReviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Round" ADD COLUMN "advancementPublishedAt" TIMESTAMP(3);
ALTER TABLE "Round" ADD COLUMN "advancementPublishedById" TEXT;
ALTER TABLE "Round" ADD CONSTRAINT "Round_advancementPublishedById_fkey"
    FOREIGN KEY ("advancementPublishedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "Result" (
    "id" TEXT NOT NULL,
    "divisionId" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "roundReachedId" TEXT NOT NULL,
    "status" "ResultStatus" NOT NULL,
    "placement" INTEGER,
    "calculationVersion" TEXT NOT NULL DEFAULT 'v1',
    "publishedAt" TIMESTAMP(3),
    "publishedById" TEXT,
    "createdById" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Result_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Result_divisionId_registrationId_version_key" ON "Result"("divisionId", "registrationId", "version");
CREATE INDEX "Result_divisionId_registrationId_idx" ON "Result"("divisionId", "registrationId");
ALTER TABLE "Result" ADD CONSTRAINT "Result_divisionId_fkey"
    FOREIGN KEY ("divisionId") REFERENCES "Division"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Result" ADD CONSTRAINT "Result_registrationId_fkey"
    FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Result" ADD CONSTRAINT "Result_roundReachedId_fkey"
    FOREIGN KEY ("roundReachedId") REFERENCES "Round"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Result" ADD CONSTRAINT "Result_publishedById_fkey"
    FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Result" ADD CONSTRAINT "Result_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Result" ENABLE ROW LEVEL SECURITY;
