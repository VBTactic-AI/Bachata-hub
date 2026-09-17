-- FestivalGuestQuestion: анти-спам по IP (2026-09-17) — форма вопроса гостя
-- анонимная (без авторизации), лимит "не больше N вопросов с одного IP на
-- фестиваль за короткое окно" реализуется в сервисном слое
-- (festival-guest-question-service.ts), здесь только поле + индекс под него.
ALTER TABLE "FestivalGuestQuestion" ADD COLUMN "submitterIp" TEXT;
CREATE INDEX "FestivalGuestQuestion_festivalId_submitterIp_createdAt_idx"
  ON "FestivalGuestQuestion"("festivalId", "submitterIp", "createdAt");
