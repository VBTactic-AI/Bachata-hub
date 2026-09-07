-- Правит миграцию 20260907020000: та политика была логически верной, но
-- никогда не срабатывала — её EXISTS-подзапрос идёт через DrawParticipant/
-- Draw/Heat, а у ВСЕХ ТРЁХ таблиц тоже включён RLS без единой политики
-- (deny-all) — подзапрос под ролью "authenticated" видел там ноль строк,
-- и политика была всегда ложна, независимо от совпадения roundId (найдено
-- вживую, 2026-09-07 — прямая проверка через Realtime с реальным токеном
-- не отдавала событие, хотя ручная симуляция SET ROLE + claims показывала
-- строку видимой при точной подмене условий).
--
-- Решение — SECURITY DEFINER функция: она бежит с правами ВЛАДЕЛЬЦА функции
-- (тот же пользователь, что накатывает миграции — обычно владеет и этими
-- таблицами, то есть обходит их RLS), а не с правами вызывающей роли. Не
-- открывает доступ к DrawParticipant/Draw/Heat вообще — только эту узкую
-- проверку "участник Х принадлежит раунду Y".
--
-- REPLICA IDENTITY FULL — не обязательно оказалось причиной проблемы (сам
-- баг был в RLS-подзапросе), но Supabase рекомендует его для таблиц с
-- Realtime UPDATE/DELETE (иначе WAL несёт только PK старой строки) — не
-- вредит, оставляем.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'JudgeScore') THEN
    EXECUTE 'ALTER TABLE "JudgeScore" REPLICA IDENTITY FULL';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'FinalJudgeScore') THEN
    EXECUTE 'ALTER TABLE "FinalJudgeScore" REPLICA IDENTITY FULL';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.score_monitor_round_matches(p_draw_participant_id text, p_round_id text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $func$
  SELECT EXISTS (
    SELECT 1
    FROM "DrawParticipant" dp
    JOIN "Draw" d ON d.id = dp."drawId"
    JOIN "Heat" h ON h.id = d."heatId"
    WHERE dp.id = p_draw_participant_id
      AND h."roundId" = p_round_id
  );
$func$;

GRANT EXECUTE ON FUNCTION public.score_monitor_round_matches(text, text) TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'JudgeScore') THEN
    DROP POLICY IF EXISTS "realtime_read_by_round_token" ON "JudgeScore";
    EXECUTE $sql$
      CREATE POLICY "realtime_read_by_round_token" ON "JudgeScore"
      FOR SELECT
      TO authenticated
      USING (
        (auth.jwt() ->> 'roundId') IS NOT NULL
        AND public.score_monitor_round_matches("JudgeScore"."drawParticipantId", (auth.jwt() ->> 'roundId'))
      )
    $sql$;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'FinalJudgeScore') THEN
    DROP POLICY IF EXISTS "realtime_read_by_round_token" ON "FinalJudgeScore";
    EXECUTE $sql$
      CREATE POLICY "realtime_read_by_round_token" ON "FinalJudgeScore"
      FOR SELECT
      TO authenticated
      USING (
        (auth.jwt() ->> 'roundId') IS NOT NULL
        AND public.score_monitor_round_matches("FinalJudgeScore"."drawParticipantId", (auth.jwt() ->> 'roundId'))
      )
    $sql$;
  END IF;
END $$;
