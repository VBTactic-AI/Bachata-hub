-- Bachata HUB Belarus — слой 3
-- Пол в профиле (только как подсказка по умолчанию при регистрации, НЕ
-- жёсткое правило — см. docs/00_DECISIONS.md) + подтверждение роли, если
-- участник выбрал роль, отличную от подсказки по полу.

CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE');
ALTER TABLE "Dancer" ADD COLUMN "gender" "Gender";

CREATE TYPE "RegistrationRoleOverrideStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE "Registration" ADD COLUMN "requestedRole" "RegistrationRole";
ALTER TABLE "Registration" ADD COLUMN "roleOverrideStatus" "RegistrationRoleOverrideStatus";
ALTER TABLE "Registration" ADD COLUMN "roleOverrideReviewedById" TEXT;
ALTER TABLE "Registration" ADD COLUMN "roleOverrideReviewedAt" TIMESTAMP(3);

ALTER TABLE "Registration" ADD CONSTRAINT "Registration_roleOverrideReviewedById_fkey"
    FOREIGN KEY ("roleOverrideReviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
