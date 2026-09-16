-- Bachata HUB — перенос UI-фич Festival Engine (UI-прототип) в БД
-- (2026-09-17). План и принятые решения — docs/FESTIVAL_UI_TO_DB_PLAN.md.
-- Только схема: сервисный слой (реальная реализация промокодов/рефкодов на
-- страницах, резолв аудитории рассылки по Pass и т.п.) — следующий этап, не
-- в этой миграции.

-- ---------------------------------------------------------------------------
-- Pass: условия возврата (политика, не факт возврата — Ticket.status уже
-- содержит REFUNDED, это разные оси, см. комментарий у enum в schema.prisma).
-- ---------------------------------------------------------------------------
CREATE TYPE "PassRefundPolicy" AS ENUM ('NONE', 'UNTIL_DATE', 'PARTIAL', 'FULL');

ALTER TABLE "Pass" ADD COLUMN "refundPolicy" "PassRefundPolicy" NOT NULL DEFAULT 'NONE';
ALTER TABLE "Pass" ADD COLUMN "refundDeadline" TIMESTAMP(3);
ALTER TABLE "Pass" ADD COLUMN "refundFeePercent" DECIMAL(5,2);

-- ---------------------------------------------------------------------------
-- ProgramItem: лимит мест на конкретный пункт программы + переключатель
-- публичного показа остатка (по образцу уже существующего Event.capacity).
-- ---------------------------------------------------------------------------
ALTER TABLE "ProgramItem" ADD COLUMN "capacity" INTEGER;
ALTER TABLE "ProgramItem" ADD COLUMN "showCapacityPublicly" BOOLEAN NOT NULL DEFAULT true;

-- ---------------------------------------------------------------------------
-- Review: отзыв о школе ИЛИ о фестивале — ровно одно из двух (решение №2
-- плана). Существующая модерация (moderationStatus) переиспользуется как
-- есть; для отзыва о фестивале модератор — организатор ЭТОГО фестиваля
-- (проверка прав — сервисный слой, не схема).
-- ---------------------------------------------------------------------------
ALTER TABLE "Review" ALTER COLUMN "schoolId" DROP NOT NULL;
ALTER TABLE "Review" ADD COLUMN "festivalId" TEXT;
CREATE INDEX "Review_festivalId_idx" ON "Review"("festivalId");
ALTER TABLE "Review" ADD CONSTRAINT "Review_festivalId_fkey"
    FOREIGN KEY ("festivalId") REFERENCES "Festival"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Review" ADD CONSTRAINT "Review_exactly_one_target" CHECK (
    (("schoolId" IS NOT NULL)::int + ("festivalId" IS NOT NULL)::int) = 1
);

-- ---------------------------------------------------------------------------
-- FestivalSponsor — спонсоры/партнёры фестиваля, показываются на публичной
-- странице. tier — свободная строка (решение №5 плана), не enum.
-- ---------------------------------------------------------------------------
CREATE TABLE "FestivalSponsor" (
    "id" TEXT NOT NULL,
    "festivalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "logoUrl" TEXT,
    "websiteUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FestivalSponsor_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "FestivalSponsor_festivalId_idx" ON "FestivalSponsor"("festivalId");
ALTER TABLE "FestivalSponsor" ADD CONSTRAINT "FestivalSponsor_festivalId_fkey"
    FOREIGN KEY ("festivalId") REFERENCES "Festival"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FestivalSponsor" ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- FestivalFaqItem — статичный FAQ, ведёт организатор, показывается
-- аккордеоном на публичной странице.
-- ---------------------------------------------------------------------------
CREATE TABLE "FestivalFaqItem" (
    "id" TEXT NOT NULL,
    "festivalId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FestivalFaqItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "FestivalFaqItem_festivalId_idx" ON "FestivalFaqItem"("festivalId");
ALTER TABLE "FestivalFaqItem" ADD CONSTRAINT "FestivalFaqItem_festivalId_fkey"
    FOREIGN KEY ("festivalId") REFERENCES "Festival"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FestivalFaqItem" ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- FestivalGuestQuestion — вопрос гостя. moderationStatus (виден ли вопрос
-- публично — решает организатор, решение №3 плана) и answer/answeredAt
-- (ответил ли организатор) — ДВЕ независимые оси, не одно и то же поле.
-- ---------------------------------------------------------------------------
CREATE TABLE "FestivalGuestQuestion" (
    "id" TEXT NOT NULL,
    "festivalId" TEXT NOT NULL,
    "askerName" TEXT,
    "question" TEXT NOT NULL,
    "moderationStatus" "ModerationStatus" NOT NULL DEFAULT 'PENDING',
    "moderatedById" TEXT,
    "moderatedAt" TIMESTAMP(3),
    "answer" TEXT,
    "answeredById" TEXT,
    "answeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FestivalGuestQuestion_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "FestivalGuestQuestion_festivalId_idx" ON "FestivalGuestQuestion"("festivalId");
CREATE INDEX "FestivalGuestQuestion_moderationStatus_idx" ON "FestivalGuestQuestion"("moderationStatus");
ALTER TABLE "FestivalGuestQuestion" ADD CONSTRAINT "FestivalGuestQuestion_festivalId_fkey"
    FOREIGN KEY ("festivalId") REFERENCES "Festival"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FestivalGuestQuestion" ADD CONSTRAINT "FestivalGuestQuestion_moderatedById_fkey"
    FOREIGN KEY ("moderatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FestivalGuestQuestion" ADD CONSTRAINT "FestivalGuestQuestion_answeredById_fkey"
    FOREIGN KEY ("answeredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FestivalGuestQuestion" ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- FestivalExpense — статьи расходов для вкладки "Бюджет" (доход считается
-- из уже существующих Ticket/Pass/спонсоров, отдельной сущности не требует).
-- ---------------------------------------------------------------------------
CREATE TYPE "FestivalExpenseCategory" AS ENUM ('ARTISTS', 'VENUE', 'MARKETING', 'EQUIPMENT', 'OTHER');
CREATE TYPE "FestivalExpenseStatus" AS ENUM ('PENDING', 'PAID');

CREATE TABLE "FestivalExpense" (
    "id" TEXT NOT NULL,
    "festivalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" "FestivalExpenseCategory" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT,
    "status" "FestivalExpenseStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FestivalExpense_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "FestivalExpense_festivalId_idx" ON "FestivalExpense"("festivalId");
ALTER TABLE "FestivalExpense" ADD CONSTRAINT "FestivalExpense_festivalId_fkey"
    FOREIGN KEY ("festivalId") REFERENCES "Festival"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FestivalExpense" ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- FestivalReferralCode — ОТДЕЛЬНАЯ модель от PromoCode (решение №4 плана,
-- прямое требование пользователя): атрибуция продаж артисту/школе, может
-- быть без скидки вообще. Владелец — ровно один из
-- ownerTeacherId/ownerSchoolId. discountType добавлен сверх исходного
-- списка полей пользователя (без него discountValue не по чему
-- интерпретировать), переиспользован существующий PromoDiscountType.
-- ---------------------------------------------------------------------------
CREATE TYPE "ReferralCommissionType" AS ENUM ('PERCENT', 'FIXED_AMOUNT');

CREATE TABLE "FestivalReferralCode" (
    "id" TEXT NOT NULL,
    "festivalId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "ownerTeacherId" TEXT,
    "ownerSchoolId" TEXT,
    "discountType" "PromoDiscountType",
    "discountValue" DECIMAL(10,2),
    "commissionType" "ReferralCommissionType" NOT NULL,
    "commissionValue" DECIMAL(10,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FestivalReferralCode_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FestivalReferralCode_exactly_one_owner" CHECK (
        (("ownerTeacherId" IS NOT NULL)::int + ("ownerSchoolId" IS NOT NULL)::int) = 1
    )
);
CREATE UNIQUE INDEX "FestivalReferralCode_festivalId_code_key" ON "FestivalReferralCode"("festivalId", "code");
CREATE INDEX "FestivalReferralCode_festivalId_idx" ON "FestivalReferralCode"("festivalId");
CREATE INDEX "FestivalReferralCode_ownerTeacherId_idx" ON "FestivalReferralCode"("ownerTeacherId");
CREATE INDEX "FestivalReferralCode_ownerSchoolId_idx" ON "FestivalReferralCode"("ownerSchoolId");
ALTER TABLE "FestivalReferralCode" ADD CONSTRAINT "FestivalReferralCode_festivalId_fkey"
    FOREIGN KEY ("festivalId") REFERENCES "Festival"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FestivalReferralCode" ADD CONSTRAINT "FestivalReferralCode_ownerTeacherId_fkey"
    FOREIGN KEY ("ownerTeacherId") REFERENCES "Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FestivalReferralCode" ADD CONSTRAINT "FestivalReferralCode_ownerSchoolId_fkey"
    FOREIGN KEY ("ownerSchoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FestivalReferralCode" ENABLE ROW LEVEL SECURITY;

-- Ticket: снимок скидки/комиссии реферального кода на момент выдачи (та же
-- природа, что и уже существующие promoCodeId/discountAmount).
ALTER TABLE "Ticket" ADD COLUMN "referralCodeId" TEXT;
ALTER TABLE "Ticket" ADD COLUMN "referralDiscountAmount" DECIMAL(10,2);
ALTER TABLE "Ticket" ADD COLUMN "referralCommissionAmount" DECIMAL(10,2);
CREATE INDEX "Ticket_referralCodeId_idx" ON "Ticket"("referralCodeId");
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_referralCodeId_fkey"
    FOREIGN KEY ("referralCodeId") REFERENCES "FestivalReferralCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Рассылка держателям конкретного Pass (решение №1 плана) — новое значение
-- цели рассылки; существующий Broadcast/Subscription не трогаем, targetId в
-- этом случае = Pass.id, аудитория резолвится держателями Ticket, а не
-- строками Subscription (сервисный слой — следующий этап).
-- ---------------------------------------------------------------------------
ALTER TYPE "SubscriptionType" ADD VALUE 'PASS';
