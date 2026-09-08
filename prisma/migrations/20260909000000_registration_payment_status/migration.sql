-- Bachata HUB Belarus — слой 3
-- Оплата (redesign вкладки "Участники", 2026-09-09) — только факт
-- оплачено/не оплачено, без сумм/валюты (по решению пользователя, поле
-- расширится отдельной задачей позже). Переключается вручную организатором.

ALTER TABLE "Registration" ADD COLUMN "isPaid" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Registration" ADD COLUMN "paidAt" TIMESTAMP(3);
