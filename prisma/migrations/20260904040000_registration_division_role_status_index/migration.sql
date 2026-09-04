-- Перф.-аудит (2026-09-04): жеребьёвка (draw-engine.ts), добор помощников
-- (draw-helper.ts) и groupBy на странице соревнования фильтруют
-- Registration по divisionId+role+status БЕЗ competitionId в WHERE —
-- существующий составной индекс (competitionId, divisionId, dancerId) для
-- такого запроса не подходит. При текущем размере таблиц эффекта не даёт
-- (см. отчёт), но нужен по мере роста числа участников на соревнование.
CREATE INDEX "Registration_divisionId_role_status_idx" ON "public"."Registration"("divisionId", "role", "status");
