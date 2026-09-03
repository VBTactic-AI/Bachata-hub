-- Bachata HUB Belarus — слой 3
-- Round.name (свободный текст) заменяется на общий редактируемый справочник
-- RoundStageCatalog (управляет только SUPER_ADMIN, по образцу
-- DivisionCategory) — организатор выбирает этап из списка, а не придумывает
-- название сам. Round.type (enum) остаётся только для служебных раундов,
-- которые заводит сам движок (TIE_BREAK/DANCE_OFF, Этап 8) — они в
-- справочник не входят. Division.heatCapacity добавляется для расчёта
-- количества заездов при авто-генерации раундов (docs/00_DECISIONS.md, A7).

CREATE TABLE "RoundStageCatalog" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "defaultAdvanceCount" INTEGER NOT NULL,
    CONSTRAINT "RoundStageCatalog_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RoundStageCatalog_name_key" ON "RoundStageCatalog"("name");

INSERT INTO "RoundStageCatalog" ("id", "name", "order", "isActive", "defaultAdvanceCount") VALUES
    ('roundstage_otborochny', 'Отборочный', 1, true, 24),
    ('roundstage_chetvertfinal', 'Четвертьфинал', 2, true, 8),
    ('roundstage_polufinal', 'Полуфинал', 3, true, 4),
    ('roundstage_final', 'Финал', 4, true, 1);

ALTER TABLE "Division" ADD COLUMN "heatCapacity" INTEGER NOT NULL DEFAULT 10;

ALTER TABLE "Round" ADD COLUMN "stageId" TEXT;
ALTER TABLE "Round" ADD COLUMN "heatCapacity" INTEGER;
ALTER TABLE "Round" ALTER COLUMN "type" DROP NOT NULL;

-- Существующие тестовые раунды с type=PRELIMINARY переносятся на этап
-- "Отборочный" — конкретное свободное название ("Первый отборочный" и т.п.)
-- при этом теряется (заменяется общим именем этапа), это ожидаемо и заранее
-- проговорено с пользователем.
UPDATE "Round" SET "stageId" = 'roundstage_otborochny', "type" = NULL WHERE "type" = 'PRELIMINARY';
UPDATE "Round" SET "stageId" = 'roundstage_chetvertfinal', "type" = NULL WHERE "type" = 'QUARTERFINAL';
UPDATE "Round" SET "stageId" = 'roundstage_polufinal', "type" = NULL WHERE "type" = 'SEMIFINAL';
UPDATE "Round" SET "stageId" = 'roundstage_final', "type" = NULL WHERE "type" = 'FINAL';
-- CALLBACK не входит в новый справочник (не использовался) — если вдруг
-- встретится, оставляем как служебный тип, а не теряем строку молча.

ALTER TABLE "Round" ADD CONSTRAINT "Round_stageId_fkey"
    FOREIGN KEY ("stageId") REFERENCES "RoundStageCatalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Round" ADD CONSTRAINT "Round_stage_xor_type_check"
    CHECK (
        ("stageId" IS NOT NULL AND "type" IS NULL)
        OR ("stageId" IS NULL AND "type" IN ('TIE_BREAK', 'DANCE_OFF', 'CALLBACK'))
    );

ALTER TABLE "Round" DROP COLUMN "name";

ALTER TABLE "RoundStageCatalog" ENABLE ROW LEVEL SECURITY;
