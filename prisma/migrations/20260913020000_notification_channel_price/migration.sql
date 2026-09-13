-- Bachata HUB Belarus — слой 1
-- Subscription & Notification Control Center (админка) — настраиваемая
-- ОЦЕНОЧНАЯ цена доставки за канал (Phase 9 из плана Notification Engine,
-- см. docs/PROGRESS.md). Ни один провайдер (Resend/Web Push/Telegram) не
-- даёт API с реальным биллингом конкретной рассылки — это конфигурируемое
-- число админа для оценки объём × цена, не факт из системы оплаты.
-- IN_APP сюда не заводится вовсе — канал не уходит вовне, стоимость всегда 0.
--
-- RLS включается без политик, как и для всех новых таблиц проекта.

CREATE TABLE "NotificationChannelPrice" (
    "channel" "NotificationChannel" NOT NULL,
    "pricePerThousand" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,
    CONSTRAINT "NotificationChannelPrice_pkey" PRIMARY KEY ("channel")
);
CREATE INDEX "NotificationChannelPrice_updatedById_idx" ON "NotificationChannelPrice"("updatedById");
ALTER TABLE "NotificationChannelPrice" ADD CONSTRAINT "NotificationChannelPrice_updatedById_fkey"
    FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "NotificationChannelPrice" ENABLE ROW LEVEL SECURITY;
