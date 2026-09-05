-- Bachata HUB Belarus — слой 3
-- Публичная часть (Этап 12) — чисто информационные поля для зрителей,
-- ни на что в движке не влияют.

ALTER TABLE "Competition" ADD COLUMN "rulesText" TEXT;
ALTER TABLE "Competition" ADD COLUMN "rulesUrl" TEXT;
ALTER TABLE "Competition" ADD COLUMN "mediaUrl" TEXT;
