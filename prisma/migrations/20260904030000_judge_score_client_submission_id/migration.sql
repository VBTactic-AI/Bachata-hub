-- Офлайн-очередь оценок судьи (CLAUDE.md §17, Этап 7).
ALTER TABLE "JudgeScore" ADD COLUMN "clientSubmissionId" TEXT;
