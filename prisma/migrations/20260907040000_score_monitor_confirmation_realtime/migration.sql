-- Живая подпись "✓ Готово" на табло оценок (score-monitor) не обновлялась
-- без F5 — браузер подписан только на JudgeScore/FinalJudgeScore, а сама
-- кнопка "Готово" (confirmJudgeRoundDone/confirmFinalJudgeRoundDone) пишет
-- в JudgeRoundConfirmation, на неё подписки не было (найдено вживую,
-- 2026-09-07). В отличие от JudgeScore, здесь roundId — ПРЯМАЯ колонка,
-- SECURITY DEFINER функция не нужна.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'JudgeRoundConfirmation') THEN
    BEGIN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE "JudgeRoundConfirmation"';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'JudgeRoundConfirmation') THEN
    DROP POLICY IF EXISTS "realtime_read_by_round_token" ON "JudgeRoundConfirmation";
    EXECUTE $sql$
      CREATE POLICY "realtime_read_by_round_token" ON "JudgeRoundConfirmation"
      FOR SELECT
      TO authenticated
      USING ((auth.jwt() ->> 'roundId') = "roundId")
    $sql$;
  END IF;
END $$;
