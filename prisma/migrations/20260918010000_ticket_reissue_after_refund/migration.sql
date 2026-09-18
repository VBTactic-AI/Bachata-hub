-- Bachata HUB — билет нельзя было выдать повторно после возврата (2026-09-18,
-- найдено вживую пользователем: "нажал вернуть оплату, и не могу сразу еще
-- раз взять на него билет" / "пишет, что уже билет есть"). Причина: три
-- уникальных индекса на Ticket были заведены БЕЗ учёта status — они считали
-- дубликатом любую пару (dancerId, passId/ticketTypeId, eventId), даже если
-- старая запись уже CANCELLED/REFUNDED (история намеренно не удаляется,
-- CLAUDE.md §18/§51). Возврат освобождает место допуска
-- (assertSingleAdmissionPerEvent проверяет только status='ISSUED'), но
-- INSERT нового Ticket на тот же Pass/TicketType падал в P2002 →
-- DuplicateTicketError раньше, чем до этой проверки вообще доходило.
-- Пересоздаём все три как partial unique index WHERE status = 'ISSUED' —
-- тот же приём, что уже применён для "no_product_key" ниже, теперь
-- дополнительно ограниченный по статусу.

DROP INDEX "Ticket_dancerId_passId_eventId_key";
CREATE UNIQUE INDEX "Ticket_dancerId_passId_eventId_key" ON "Ticket"("dancerId", "passId", "eventId")
    WHERE "status" = 'ISSUED';

DROP INDEX "Ticket_dancerId_ticketTypeId_key";
CREATE UNIQUE INDEX "Ticket_dancerId_ticketTypeId_key" ON "Ticket"("dancerId", "ticketTypeId")
    WHERE "status" = 'ISSUED';

DROP INDEX "Ticket_dancerId_eventId_no_product_key";
CREATE UNIQUE INDEX "Ticket_dancerId_eventId_no_product_key" ON "Ticket"("dancerId", "eventId")
    WHERE "passId" IS NULL AND "ticketTypeId" IS NULL AND "status" = 'ISSUED';
