-- Bachata HUB Belarus — слой 1
-- Subscription & Notification Control Center — Broadcast (ручная рассылка
-- админом). НЕ через NotificationJob/шаблон — текст вводит админ вживую,
-- аудитория уже известна на входе. targetType=null означает "все
-- пользователи"; иначе — подписчики конкретной цели (та же модель
-- type+targetId, что и Subscription). targetLabel — снимок отображаемого
-- имени цели на момент отправки (CLAUDE.md §50-51, история не должна
-- ломаться от переименования/удаления цели позже).
--
-- RLS включается без политик, как и для всех новых таблиц проекта.

CREATE TABLE "Broadcast" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "deepLink" TEXT,
    "targetType" "SubscriptionType",
    "targetId" TEXT,
    "targetLabel" TEXT NOT NULL,
    "recipientCount" INTEGER NOT NULL,
    "sentById" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Broadcast_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Broadcast_clientRequestId_key" ON "Broadcast"("clientRequestId");
CREATE INDEX "Broadcast_sentById_idx" ON "Broadcast"("sentById");
ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_sentById_fkey"
    FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Notification" ADD COLUMN "broadcastId" TEXT;
CREATE INDEX "Notification_broadcastId_idx" ON "Notification"("broadcastId");
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_broadcastId_fkey"
    FOREIGN KEY ("broadcastId") REFERENCES "Broadcast"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Broadcast" ENABLE ROW LEVEL SECURITY;
