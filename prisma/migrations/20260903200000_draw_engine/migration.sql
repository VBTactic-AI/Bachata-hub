-- Bachata HUB Belarus — слой 3
-- Draw Engine (Этап 5, docs/00_DECISIONS.md A5/A6): Draw — один акт
-- "сформировали список вызванных для заезда", версионируется как
-- CompetitionRules (reroll не удаляет старую версию). DrawParticipant —
-- один вызванный человек: кто, в какой роли, считается ли ему оценка.
-- Конкретные пары (кто с кем реально танцевал) НЕ хранятся — физически
-- невозможно знать, участники сами образуют пары на паркете.

CREATE TYPE "DrawHelperSource" AS ENUM ('GUEST_HIGHER_CATEGORY', 'REUSED_ALREADY_SCORED');

CREATE TABLE "Draw" (
    "id" TEXT NOT NULL,
    "heatId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "seed" TEXT,
    "algorithmVersion" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    CONSTRAINT "Draw_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Draw_heatId_version_key" ON "Draw"("heatId", "version");
ALTER TABLE "Draw" ADD CONSTRAINT "Draw_heatId_fkey"
    FOREIGN KEY ("heatId") REFERENCES "Heat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Draw" ADD CONSTRAINT "Draw_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "DrawParticipant" (
    "id" TEXT NOT NULL,
    "drawId" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "role" "RegistrationRole" NOT NULL,
    "scored" BOOLEAN NOT NULL DEFAULT true,
    "helperSource" "DrawHelperSource",
    "calledOrder" INTEGER NOT NULL,
    CONSTRAINT "DrawParticipant_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DrawParticipant_drawId_registrationId_key" ON "DrawParticipant"("drawId", "registrationId");
ALTER TABLE "DrawParticipant" ADD CONSTRAINT "DrawParticipant_drawId_fkey"
    FOREIGN KEY ("drawId") REFERENCES "Draw"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DrawParticipant" ADD CONSTRAINT "DrawParticipant_registrationId_fkey"
    FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Draw" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DrawParticipant" ENABLE ROW LEVEL SECURITY;
