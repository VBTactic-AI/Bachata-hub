-- Bachata HUB — PassTemplate (2026-09-16, по прямому запросу пользователя):
-- "полностью заведённый Pass, сохранённый как шаблон" — переиспользуется при
-- создании Pass на разных событиях. НЕ хранит даты (свои у каждого события)
-- и НЕ хранит quantity-динамику (soldQuantity/status — состояние конкретного
-- Pass). Владелец — конкретный User, шаблоны видны только ему (+ ADMIN).

CREATE TABLE "PassTemplate" (
    "id" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
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
    CONSTRAINT "PassTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PassTemplate_createdById_idx" ON "PassTemplate"("createdById");

ALTER TABLE "PassTemplate" ADD CONSTRAINT "PassTemplate_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PassTemplate" ENABLE ROW LEVEL SECURITY;
