-- Разрешает браузеру head judge/admin подписываться на Supabase Realtime
-- НАПРЯМУЮ (без сервера-посредника — тот обрывался и холодно стартовал
-- заново каждые ~55-60с на Vercel serverless, 2026-09-07) для двух таблиц
-- оценок. RLS на них уже был включён БЕЗ политик (deny-all) — эта миграция
-- добавляет ровно одну политику на каждую: строка видна только тому, у кого
-- есть короткоживущий JWT с claim "roundId", совпадающим с раундом ЭТОЙ
-- оценки (через DrawParticipant -> Draw -> Heat -> Round). Такой токен
-- выдаёт ТОЛЬКО наш сервер (score-monitor/realtime-token/route.ts), и только
-- после обычной проверки requirePermission("score:view_all", ...) — сама
-- политика не заменяет эту проверку, она полагается на то, что токен уже
-- был выдан правильно. Запись (INSERT/UPDATE) по-прежнему идёт только через
-- API + Prisma (submitJudgeScore/submitFinalJudgeScore), эта политика — либо
-- SELECT.
--
-- Публичный anon-ключ без такого токена по-прежнему не видит ничего (нет
-- политики "разрешить anon") — это осознанно: только выданный сервером
-- токен открывает доступ, а не сам факт наличия публичного ключа.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'JudgeScore') THEN
    EXECUTE $sql$
      CREATE POLICY "realtime_read_by_round_token" ON "JudgeScore"
      FOR SELECT
      TO authenticated
      USING (
        (auth.jwt() ->> 'roundId') IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM "DrawParticipant" dp
          JOIN "Draw" d ON d.id = dp."drawId"
          JOIN "Heat" h ON h.id = d."heatId"
          WHERE dp.id = "JudgeScore"."drawParticipantId"
            AND h."roundId" = (auth.jwt() ->> 'roundId')
        )
      )
    $sql$;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'FinalJudgeScore') THEN
    EXECUTE $sql$
      CREATE POLICY "realtime_read_by_round_token" ON "FinalJudgeScore"
      FOR SELECT
      TO authenticated
      USING (
        (auth.jwt() ->> 'roundId') IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM "DrawParticipant" dp
          JOIN "Draw" d ON d.id = dp."drawId"
          JOIN "Heat" h ON h.id = d."heatId"
          WHERE dp.id = "FinalJudgeScore"."drawParticipantId"
            AND h."roundId" = (auth.jwt() ->> 'roundId')
        )
      )
    $sql$;
  END IF;
END $$;
