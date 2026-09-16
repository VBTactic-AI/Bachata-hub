-- Recurring Events — автопубликация: "за N минут до старта" заменено на
-- "за N дней, в HH:mm" (по прямому запросу пользователя — публикация не
-- должна случайно попасть на 3 часа ночи). Таблица EventSeries ещё пустая
-- (фича не в проде) — переименование через DROP+ADD, без backfill.

-- AlterTable
ALTER TABLE "EventSeries" DROP COLUMN "publishBeforeMinutes";
ALTER TABLE "EventSeries" ADD COLUMN "publishDaysBefore" INTEGER;
ALTER TABLE "EventSeries" ADD COLUMN "publishAtTime" TEXT;
