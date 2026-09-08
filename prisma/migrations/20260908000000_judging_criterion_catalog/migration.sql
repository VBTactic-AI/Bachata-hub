-- Bachata HUB Belarus — слой 3
-- Глобальный справочник критериев оценки (JudgingCriterionCatalog,
-- Справочники → Оценочные показатели, judging_criteria:manage, только
-- SUPER_ADMIN) — по образцу DivisionCategory/RoundStageCatalog. Критерии
-- финала (FinalCriterion) повторяются из соревнования в соревнование
-- (пользователь, 2026-09-08) — вместо ввода с нуля на каждом дивизионе
-- организатор выбирает из этого списка. Выбор КОПИРУЕТ значения в
-- FinalCriterion (catalogId — только след происхождения, не живая ссылка) —
-- правка каталога задним числом не меняет уже настроенный/идущий финал
-- (CLAUDE.md §50-51).

CREATE TABLE "JudgingCriterionCatalog" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minScore" INTEGER NOT NULL,
    "maxScore" INTEGER NOT NULL,
    "step" INTEGER NOT NULL DEFAULT 1,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JudgingCriterionCatalog_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "JudgingCriterionCatalog_name_key" ON "JudgingCriterionCatalog"("name");

ALTER TABLE "FinalCriterion" ADD COLUMN "catalogId" TEXT;
ALTER TABLE "FinalCriterion" ADD CONSTRAINT "FinalCriterion_catalogId_fkey"
    FOREIGN KEY ("catalogId") REFERENCES "JudgingCriterionCatalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "FinalCriterion_catalogId_idx" ON "FinalCriterion"("catalogId");

-- Стартовый набор — те же критерии, что уже встречались в промте/референсе
-- пользователя (BDC-style, CLAUDE.md §14), чтобы справочник не открывался
-- пустым. Организатор может переименовать/скрыть/добавить свои.
INSERT INTO "JudgingCriterionCatalog" ("id", "name", "minScore", "maxScore", "step", "order", "isActive") VALUES
    ('jcrit_musicality', 'Музыкальность', 1, 10, 1, 1, true),
    ('jcrit_technique', 'Техника', 1, 10, 1, 2, true),
    ('jcrit_artistry', 'Артистизм', 1, 10, 1, 3, true),
    ('jcrit_charisma', 'Харизма', 1, 10, 1, 4, true),
    ('jcrit_overall', 'Общее впечатление', 1, 10, 1, 5, true);

ALTER TABLE "JudgingCriterionCatalog" ENABLE ROW LEVEL SECURITY;
