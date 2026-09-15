-- Bachata HUB — §7 Events Engine ТЗ: "Предложить событие".
--
-- Обычный пользователь не может создать Event сам (canCreateEvents() это
-- гейтит), но может предложить идею админу — лёгкая заявка, не полноценный
-- Event Wizard. НЕ то же самое, что AccessRequest (заявка на право создавать
-- события вообще, а не на конкретное событие).

ALTER TYPE "ModerationEntity" ADD VALUE 'EVENT_SUGGESTION';

CREATE TYPE "EventSuggestionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "EventSuggestion" (
    "id" TEXT NOT NULL,
    "suggestedById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "cityId" TEXT,
    "proposedDate" TIMESTAMP(3),
    "link" TEXT,
    "status" "EventSuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewComment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EventSuggestion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EventSuggestion_suggestedById_idx" ON "EventSuggestion"("suggestedById");
CREATE INDEX "EventSuggestion_status_idx" ON "EventSuggestion"("status");

ALTER TABLE "EventSuggestion" ADD CONSTRAINT "EventSuggestion_suggestedById_fkey"
    FOREIGN KEY ("suggestedById") REFERENCES "User"("id") ON UPDATE CASCADE;
ALTER TABLE "EventSuggestion" ADD CONSTRAINT "EventSuggestion_cityId_fkey"
    FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EventSuggestion" ADD CONSTRAINT "EventSuggestion_reviewedById_fkey"
    FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EventSuggestion" ENABLE ROW LEVEL SECURITY;
