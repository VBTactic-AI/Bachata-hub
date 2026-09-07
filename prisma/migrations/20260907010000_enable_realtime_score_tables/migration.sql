-- Включает Supabase Realtime (Postgres Changes через WAL) для двух таблиц
-- оценок — нужно для live-таблицы head judge/admin (score-relay.ts): сервер
-- слушает изменения JudgeScore/FinalJudgeScore независимо от того, что
-- запись по-прежнему идёт через Prisma (submitJudgeScore/submitFinalJudgeScore),
-- Realtime здесь только транспорт "БД -> сервер", не источник записи.
--
-- Публикация "supabase_realtime" существует только на Supabase-хостинге —
-- на локальном/self-hosted Postgres (docker-compose.yml, обычный
-- postgres:16-alpine) её нет. Оборачиваем в проверку, чтобы миграция не
-- ломала `prisma migrate dev`/деплой там, где Supabase Realtime не нужен —
-- в таком окружении фича просто останется без live-обновлений (см.
-- SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY в .env.example).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE "JudgeScore"';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE "FinalJudgeScore"';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;
