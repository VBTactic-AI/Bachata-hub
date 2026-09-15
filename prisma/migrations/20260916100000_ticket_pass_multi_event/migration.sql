-- Bachata HUB — этап 3 (межсобытийный Pass фестиваля, 2026-09-16). Один и
-- тот же Pass законно порождает НЕСКОЛЬКО Ticket у одного танцора: реальную
-- покупку на событии фестиваля и по одному производному Ticket на каждом
-- дочернем событии, где Pass был предъявлен (см. issueFestivalPassEntry() в
-- ticket-service.ts). Старая уникальность (dancerId, passId) без eventId
-- ошибочно считала второй Ticket дубликатом первого.

DROP INDEX "Ticket_dancerId_passId_key";
CREATE UNIQUE INDEX "Ticket_dancerId_passId_eventId_key" ON "Ticket"("dancerId", "passId", "eventId");
