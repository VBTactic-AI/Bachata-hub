-- Festival Engine: Festival становится first-class сущностью верхнего
-- уровня (НЕ Event(format=FESTIVAL), НЕ деталь-таблица по образцу
-- PartyDetails/MasterclassDetails). EventProgramItem переименовывается в
-- ProgramItem и переезжает с festivalDetailsId (→ FestivalDetails) на
-- festivalId (→ Festival). См. docs/FESTIVAL_ENGINE_ER.md,
-- docs/FESTIVAL_ENGINE_AUDIT.md — история решений (варианты A/B/C/D,
-- почему D, что не дублируется).
--
-- Безопасность миграции:
-- - EventProgramItem переименовывается НА МЕСТЕ (ALTER TABLE RENAME), id/PK
--   не меняются — PassAccessGrant.programItemId продолжает ссылаться на те
--   же строки без пересчёта, никакого риска для существующих грантов.
-- - Для каждой существующей FestivalDetails создаётся ровно одна Festival-
--   строка (eventId старой FestivalDetails становится Festival.eventId —
--   тот самый bridge Event, на котором физически стояла программа).
--   Тестовые данные в проде не критичны (подтверждено пользователем), но
--   миграция всё равно написана как безопасный backfill, а не destructive
--   truncate — если данные и есть, они не теряются.
-- - FestivalDetails удаляется последней, когда на неё уже ничего не
--   ссылается.

-- 1. Festival — новая таблица.
CREATE TABLE "Festival" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "cityId" TEXT NOT NULL,
    "venueName" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "eventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Festival_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Festival_slug_key" ON "Festival"("slug");
CREATE UNIQUE INDEX "Festival_eventId_key" ON "Festival"("eventId");
CREATE INDEX "Festival_cityId_idx" ON "Festival"("cityId");
CREATE INDEX "Festival_createdById_idx" ON "Festival"("createdById");

ALTER TABLE "Festival" ADD CONSTRAINT "Festival_cityId_fkey"
    FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Festival" ADD CONSTRAINT "Festival_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Festival" ADD CONSTRAINT "Festival_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 2. Backfill — одна Festival-строка на каждую существующую FestivalDetails.
-- Синтетический id ("legacy_" + старый FestivalDetails.id) — только чтобы
-- ProgramItem.festivalId было на что сослаться на шаге 3, не настоящий
-- cuid (не важно: столбец TEXT без CHECK на формат, cuid() — это
-- application-level default для НОВЫХ строк, не ограничение схемы).
INSERT INTO "Festival" ("id", "slug", "name", "cityId", "startsAt", "createdById", "eventId", "createdAt", "updatedAt")
SELECT
    'legacy_' || fd."id",
    'legacy-' || e."slug",
    e."title",
    e."cityId",
    e."startsAt",
    e."createdById",
    e."id",
    e."createdAt",
    e."updatedAt"
FROM "FestivalDetails" fd
JOIN "Event" e ON e."id" = fd."eventId";

-- 3. EventProgramItem → ProgramItem, festivalDetailsId → festivalId.
ALTER TABLE "EventProgramItem" RENAME TO "ProgramItem";
ALTER TABLE "ProgramItem" RENAME CONSTRAINT "EventProgramItem_pkey" TO "ProgramItem_pkey";

ALTER TABLE "ProgramItem" ADD COLUMN "festivalId" TEXT;
UPDATE "ProgramItem" SET "festivalId" = 'legacy_' || "festivalDetailsId";
ALTER TABLE "ProgramItem" ALTER COLUMN "festivalId" SET NOT NULL;

ALTER TABLE "ProgramItem" DROP CONSTRAINT "EventProgramItem_festivalDetailsId_fkey";
DROP INDEX "EventProgramItem_festivalDetailsId_idx";
ALTER TABLE "ProgramItem" DROP COLUMN "festivalDetailsId";

ALTER TABLE "ProgramItem" ADD CONSTRAINT "ProgramItem_festivalId_fkey"
    FOREIGN KEY ("festivalId") REFERENCES "Festival"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "ProgramItem_festivalId_idx" ON "ProgramItem"("festivalId");

ALTER TABLE "ProgramItem" RENAME CONSTRAINT "EventProgramItem_teacherId_fkey" TO "ProgramItem_teacherId_fkey";
ALTER TABLE "ProgramItem" RENAME CONSTRAINT "EventProgramItem_linkedEventId_fkey" TO "ProgramItem_linkedEventId_fkey";
ALTER INDEX "EventProgramItem_teacherId_idx" RENAME TO "ProgramItem_teacherId_idx";
ALTER INDEX "EventProgramItem_linkedEventId_idx" RENAME TO "ProgramItem_linkedEventId_idx";

-- 4. FestivalDetails — на неё уже ничего не ссылается, удаляем.
DROP TABLE "FestivalDetails";

-- 5. RLS без политик — та же конвенция, что и у всех таблиц слоя 1
-- (docs/00_DECISIONS.md). ProgramItem/PassAccessGrant уже под RLS с
-- прошлой миграции, переименование таблицы это не меняет.
ALTER TABLE "Festival" ENABLE ROW LEVEL SECURITY;
