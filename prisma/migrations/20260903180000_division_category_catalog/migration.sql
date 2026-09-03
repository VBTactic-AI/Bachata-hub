-- Bachata HUB Belarus — слой 3
-- Division.name/level (свободный текст + фиксированный enum) заменяются на
-- общий редактируемый справочник DivisionCategory (управляет только
-- SUPER_ADMIN). Существующие дивизионы переносятся 1:1 по имени — история
-- не теряется (CLAUDE.md §18), просто "легаси"-категории, которых нет в
-- новом стартовом списке, сразу помечаются неактивными (isActive=false),
-- чтобы не предлагаться при создании новых дивизионов.

CREATE TABLE "DivisionCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "DivisionCategory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DivisionCategory_name_key" ON "DivisionCategory"("name");

INSERT INTO "DivisionCategory" ("id", "name", "order", "isActive") VALUES
    ('divcat_debyutanty', 'Дебютанты', 1, true),
    ('divcat_nachinayushchie', 'Начинающие', 2, true),
    ('divcat_lyubiteli', 'Любители', 3, true),
    ('divcat_prodvinutye', 'Продвинутые', 4, true),
    ('divcat_profi', 'Профи', 5, true);

-- Легаси-категории от уже существующих Division.name, которых нет в новом
-- стартовом списке выше. ON CONFLICT("name") — если совпадёт с одной из
-- только что вставленных (напр. "Продвинутые" уже есть), просто переиспользуем её.
INSERT INTO "DivisionCategory" ("id", "name", "order", "isActive")
SELECT 'divcat_legacy_' || md5(d."name"), d."name", 100, false
FROM "Division" d
WHERE d."name" IS NOT NULL
GROUP BY d."name"
ON CONFLICT ("name") DO NOTHING;

ALTER TABLE "Division" ADD COLUMN "categoryId" TEXT;

UPDATE "Division" d
SET "categoryId" = dc."id"
FROM "DivisionCategory" dc
WHERE dc."name" = d."name";

ALTER TABLE "Division" ALTER COLUMN "categoryId" SET NOT NULL;
ALTER TABLE "Division" ADD CONSTRAINT "Division_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "DivisionCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DROP INDEX IF EXISTS "Division_competitionId_name_key";
CREATE UNIQUE INDEX "Division_competitionId_categoryId_key" ON "Division"("competitionId", "categoryId");

ALTER TABLE "Division" DROP COLUMN "name";
ALTER TABLE "Division" DROP COLUMN "level";
DROP TYPE IF EXISTS "DivisionLevel";

ALTER TABLE "DivisionCategory" ENABLE ROW LEVEL SECURITY;
