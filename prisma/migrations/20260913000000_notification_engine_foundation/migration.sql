-- Bachata HUB Belarus — слой 3
-- Notification & Subscription Engine — фундамент (Phase 2 из плана,
-- согласованного с пользователем). Только новые таблицы + FK на "User";
-- Event Engine и JNJ Competition Engine (Event/Competition/Round/Heat/...)
-- не меняются вообще — интеграция подключится отдельными хуками в их
-- сервисах на Phase 6/7, без изменения их схемы.
--
-- Organizer как отдельная сущность не заводится (согласовано с
-- пользователем) — подписка "на организатора" реализуется через SCHOOL.
-- STYLE/ARTIST из исходного ТЗ не заведены — в схеме нет справочника
-- стилей танца, заводить подписку не на что; универсальная модель
-- Subscription (type+targetId) позволит добавить их позже без новой
-- миграции этой таблицы.
--
-- RLS включается без политик, как и для всех новых таблиц проекта —
-- политика на Notification (для будущей Supabase Realtime-подписки
-- "колокольчика") добавится отдельной миграцией вместе с самой фичей
-- (Phase 8), по тому же принципу, что и score-monitor realtime RLS.

CREATE TYPE "SubscriptionType" AS ENUM ('EVENT', 'SCHOOL', 'CITY', 'COUNTRY', 'EVENT_TYPE', 'INSTRUCTOR');
CREATE TYPE "SubscriptionSource" AS ENUM ('USER', 'SYSTEM');
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'WEB_PUSH', 'EMAIL', 'TELEGRAM', 'MOBILE_PUSH', 'WHATSAPP');
CREATE TYPE "EmailFrequency" AS ENUM ('IMMEDIATE', 'DAILY_DIGEST', 'WEEKLY_DIGEST');
CREATE TYPE "NotificationPriority" AS ENUM ('INFO', 'IMPORTANT', 'URGENT');
CREATE TYPE "NotificationJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED');
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'DELIVERED', 'FAILED', 'CANCELLED');

CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "SubscriptionType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "source" "SubscriptionSource" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Subscription_userId_type_targetId_key" ON "Subscription"("userId", "type", "targetId");
CREATE INDEX "Subscription_type_targetId_idx" ON "Subscription"("type", "targetId");
CREATE INDEX "Subscription_userId_idx" ON "Subscription"("userId");
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventFormatsEnabled" "EventFormat"[],
    "notifyReminders" BOOLEAN NOT NULL DEFAULT true,
    "reminderHoursBefore" INTEGER[],
    "notifyChanges" BOOLEAN NOT NULL DEFAULT true,
    "notifyCancellations" BOOLEAN NOT NULL DEFAULT true,
    "channelsEnabled" "NotificationChannel"[],
    "emailFrequency" "EmailFrequency" NOT NULL DEFAULT 'IMMEDIATE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "NotificationPreference_userId_key" ON "NotificationPreference"("userId");
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "NotificationEndpoint" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "endpoint" TEXT NOT NULL,
    "provider" TEXT,
    "metadata" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NotificationEndpoint_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "NotificationEndpoint_userId_channel_endpoint_key" ON "NotificationEndpoint"("userId", "channel", "endpoint");
CREATE INDEX "NotificationEndpoint_userId_channel_idx" ON "NotificationEndpoint"("userId", "channel");
ALTER TABLE "NotificationEndpoint" ADD CONSTRAINT "NotificationEndpoint_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "NotificationTemplate" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "titleTemplate" TEXT NOT NULL,
    "bodyTemplate" TEXT NOT NULL,
    "deepLinkTemplate" TEXT,
    "defaultPriority" "NotificationPriority" NOT NULL DEFAULT 'INFO',
    "supportedChannels" "NotificationChannel"[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NotificationTemplate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "NotificationTemplate_key_key" ON "NotificationTemplate"("key");

CREATE TABLE "NotificationJob" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "NotificationJobStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "nextRetryAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationJob_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "NotificationJob_idempotencyKey_key" ON "NotificationJob"("idempotencyKey");
CREATE INDEX "NotificationJob_status_nextRetryAt_idx" ON "NotificationJob"("status", "nextRetryAt");

CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "priority" "NotificationPriority" NOT NULL DEFAULT 'INFO',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "deepLink" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Notification_idempotencyKey_key" ON "Notification"("idempotencyKey");
CREATE INDEX "Notification_userId_isRead_createdAt_idx" ON "Notification"("userId", "isRead", "createdAt");
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "NotificationDelivery" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "nextRetryAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "providerMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "NotificationDelivery_notificationId_channel_key" ON "NotificationDelivery"("notificationId", "channel");
CREATE INDEX "NotificationDelivery_status_nextRetryAt_idx" ON "NotificationDelivery"("status", "nextRetryAt");
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_notificationId_fkey"
    FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Subscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NotificationPreference" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NotificationEndpoint" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NotificationTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NotificationJob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NotificationDelivery" ENABLE ROW LEVEL SECURITY;
