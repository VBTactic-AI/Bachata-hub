-- Bachata HUB — Payment.method (2026-09-18, по прямому запросу пользователя):
-- способ расчёта наличными/переводом, только для provider=MANUAL. Nullable —
-- старые Payment не указывали метод, это НЕ "неизвестно наличные", это
-- буквально "не зафиксировано" (CLAUDE.md §51 — не переписываем историю).

CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'TRANSFER');
ALTER TABLE "Payment" ADD COLUMN "method" "PaymentMethod";
