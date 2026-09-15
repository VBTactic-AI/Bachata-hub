-- Bachata HUB — Events Engine: door check-in для EventRegistration.
--
-- Не отдельная таблица (в отличие от CheckIn Competition Engine — там нужны
-- бирки/заезды) — здесь только факт+время+кто отметил, инлайн-колонки, тот
-- же приём, что уже применён к paidAt/cancelledAt в этой же модели.
--
-- По прямому решению пользователя (2026-09-16): NO_SHOW остаётся реальным
-- хранимым статусом (не вычисляется на лету, как в JNJ), но организатор
-- больше не выбирает его вручную — статус проставляется автоматически
-- (см. registration-service.ts::syncNoShowForEvent), когда событие уже
-- прошло, а checkedInAt пуст.

ALTER TABLE "EventRegistration" ADD COLUMN "checkedInAt" TIMESTAMP(3);
ALTER TABLE "EventRegistration" ADD COLUMN "checkedInById" TEXT;

ALTER TABLE "EventRegistration" ADD CONSTRAINT "EventRegistration_checkedInById_fkey"
    FOREIGN KEY ("checkedInById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
