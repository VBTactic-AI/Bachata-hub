-- FestivalSponsor: сумма денежного взноса (2026-09-17, решение пользователя
-- — спонсорский взнос попадает в «Доход» вкладки «Бюджет»,
-- docs/FESTIVAL_SERVICE_LAYER_PLAN.md §2.2). Nullable — спонсор может быть
-- бартерным/информационным, без денежного взноса вообще.
ALTER TABLE "FestivalSponsor" ADD COLUMN "amount" DECIMAL(10,2);
ALTER TABLE "FestivalSponsor" ADD COLUMN "currency" TEXT;
