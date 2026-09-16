-- Bachata HUB — EventTemplateTicketType + EventTemplatePass (2026-09-16, по
-- прямому запросу пользователя): шаблон события ("EventTemplate") теперь
-- может хранить заготовки тикетов и Pass, которые при создании события ИЗ
-- шаблона копируются в настоящие TicketType/Pass строки нового Event (то же
-- "копирование только при создании", что уже применяется к typeDetails).
-- Набор полей — тот же осознанно урезанный подход, что и у PassTemplate
-- (20260916080000_pass_template/migration.sql): без дат продаж/valid-
-- периодов и без soldQuantity/status/sortOrder/isActive — это состояние
-- конкретного Pass/TicketType на конкретном событии, не шаблона.

CREATE TABLE "EventTemplateTicketType" (
    "id" TEXT NOT NULL,
    "eventTemplateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(10,2),
    "currency" TEXT,
    "quantity" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EventTemplateTicketType_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EventTemplateTicketType_eventTemplateId_idx" ON "EventTemplateTicketType"("eventTemplateId");

ALTER TABLE "EventTemplateTicketType" ADD CONSTRAINT "EventTemplateTicketType_eventTemplateId_fkey"
    FOREIGN KEY ("eventTemplateId") REFERENCES "EventTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EventTemplateTicketType" ENABLE ROW LEVEL SECURITY;

CREATE TABLE "EventTemplatePass" (
    "id" TEXT NOT NULL,
    "eventTemplateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "PassType" NOT NULL,
    "price" DECIMAL(10,2),
    "currency" TEXT,
    "quantity" INTEGER,
    "imageUrl" TEXT,
    "allowMultipleEntry" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EventTemplatePass_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EventTemplatePass_eventTemplateId_idx" ON "EventTemplatePass"("eventTemplateId");

ALTER TABLE "EventTemplatePass" ADD CONSTRAINT "EventTemplatePass_eventTemplateId_fkey"
    FOREIGN KEY ("eventTemplateId") REFERENCES "EventTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EventTemplatePass" ENABLE ROW LEVEL SECURITY;
