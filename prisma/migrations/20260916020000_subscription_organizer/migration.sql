-- Bachata HUB — NOTIF-001: подписка "на организатора" (Event.createdById),
-- отдельно от SCHOOL — у организатора без школы (свободный
-- Event.organizerName) тоже должна быть возможность подписаться именно на
-- него. Аддитивное значение enum, ничего не удаляется/не переименовывается.

ALTER TYPE "SubscriptionType" ADD VALUE 'ORGANIZER';
