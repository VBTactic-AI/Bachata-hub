-- Bachata HUB — Ticket становится универсальным (2026-09-16, по прямому
-- решению пользователя): 1 Ticket = 1 оплата, вне зависимости от того, есть
-- ли у события Pass. Событие БЕЗ Pass — один passless Ticket (passId=null)
-- на пару (event, dancer), прямая замена EventRegistration.isPaid/paidAt.

-- 1) Ticket.eventId — обязательный прямой FK на Event (раньше событие было
--    доступно только через passId -> Pass -> Event, что не работает для
--    passless Ticket). Таблица Ticket на момент этой миграции пуста (только
--    схема — сервис выдачи билетов ещё не был опубликован), backfill не
--    нужен, но колонка сначала nullable для безопасности на случай, если
--    строки всё же появились между миграциями.
ALTER TABLE "Ticket" ADD COLUMN "eventId" TEXT;
UPDATE "Ticket" t SET "eventId" = p."eventId" FROM "Pass" p WHERE t."passId" = p."id" AND t."eventId" IS NULL;
ALTER TABLE "Ticket" ALTER COLUMN "eventId" SET NOT NULL;
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "Ticket_eventId_idx" ON "Ticket"("eventId");
CREATE INDEX "Ticket_eventId_dancerId_idx" ON "Ticket"("eventId", "dancerId");

-- 2) Ticket.passId — теперь необязательный (passless Ticket для событий без Pass).
ALTER TABLE "Ticket" ALTER COLUMN "passId" DROP NOT NULL;

-- 3) Один passless Ticket на танцора на событие. PostgreSQL не считает два
--    NULL равными, поэтому обычный @@unique([dancerId, passId]) тут не
--    защищает — нужен частичный индекс (Prisma DSL не поддерживает
--    filtered/partial unique index деклативно, см. комментарий в schema.prisma).
CREATE UNIQUE INDEX "Ticket_dancerId_eventId_no_pass_key" ON "Ticket"("dancerId", "eventId") WHERE "passId" IS NULL;

-- 4) EventRegistration.isPaid/paidAt удалены — оплата теперь только через
--    Ticket.isPaid (см. п.1-3 выше). Перед удалением ОБЯЗАТЕЛЬНО выполнить
--    одноразовый backfill (см. prisma/scripts, временный tsx-скрипт,
--    задокументировано в docs/PROGRESS.md) — создать passless Ticket с тем
--    же isPaid/paidAt для каждой существующей EventRegistration, иначе
--    история оплаты потеряется безвозвратно.
ALTER TABLE "EventRegistration" DROP COLUMN "isPaid";
ALTER TABLE "EventRegistration" DROP COLUMN "paidAt";
