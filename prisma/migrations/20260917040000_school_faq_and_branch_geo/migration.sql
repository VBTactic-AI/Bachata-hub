-- Перенос публичной страницы школы на реальные данные (2026-09-17):
-- 1. SchoolBranch.latitude/longitude — необязательные координаты филиала,
--    чтобы показывать мини-карту (OpenStreetMap embed) на /schools/[slug];
--    без них публичная страница просто показывает адрес текстом.
-- 2. SchoolFaqItem — FAQ школы, по образцу FestivalFaqItem: ведёт владелец
--    (School.ownerUserId) в /admin/school, показывается аккордеоном.

ALTER TABLE "SchoolBranch" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "SchoolBranch" ADD COLUMN "longitude" DOUBLE PRECISION;

CREATE TABLE "SchoolFaqItem" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SchoolFaqItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SchoolFaqItem_schoolId_idx" ON "SchoolFaqItem"("schoolId");
ALTER TABLE "SchoolFaqItem" ADD CONSTRAINT "SchoolFaqItem_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolFaqItem" ENABLE ROW LEVEL SECURITY;
