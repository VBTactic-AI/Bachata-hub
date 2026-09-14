-- Bachata HUB — Events Engine, Stage 1.
--
-- 1) EventFormat: добавляем 4 новых значения аддитивно (тот же приём, что и
-- A27 — ALTER TYPE ... ADD VALUE, без переименования/удаления существующих
-- значений). MASTERCLASS/CONTEST НЕ переименовываются — используются 29
-- существующими событиями плюс PartyDetails/MasterclassDetails/
-- Competition.eventId (решение пользователя, 2026-09-15: расширить
-- таксономию аддитивно, а не переписывать существующую).
ALTER TYPE "EventFormat" ADD VALUE 'SOCIAL';
ALTER TYPE "EventFormat" ADD VALUE 'OPEN_AIR';
ALTER TYPE "EventFormat" ADD VALUE 'PRACTICE';
ALTER TYPE "EventFormat" ADD VALUE 'OTHER';

-- 2) EventCertainty — независимая ось от EventStatus (lifecycle) и
-- moderationStatus (решение модератора): "насколько точны дата/место"
-- события. Default CONFIRMED сохраняет поведение всех существующих строк.
CREATE TYPE "EventCertainty" AS ENUM ('TENTATIVE', 'CONFIRMED');
ALTER TABLE "Event" ADD COLUMN "certainty" "EventCertainty" NOT NULL DEFAULT 'CONFIRMED';
