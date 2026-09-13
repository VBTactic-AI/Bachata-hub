-- Bachata HUB Belarus — слой 1
-- Telegram provider — привязка аккаунта через одноразовую ссылку
-- (t.me/<bot>?start=<token>), см. src/server/notifications/telegram-link.ts.
-- token генерируется приложением (crypto.randomBytes), не Prisma-дефолтом.
--
-- RLS включается без политик, как и для всех новых таблиц проекта.

CREATE TABLE "TelegramLinkToken" (
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TelegramLinkToken_pkey" PRIMARY KEY ("token")
);
CREATE INDEX "TelegramLinkToken_userId_idx" ON "TelegramLinkToken"("userId");
ALTER TABLE "TelegramLinkToken" ADD CONSTRAINT "TelegramLinkToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TelegramLinkToken" ENABLE ROW LEVEL SECURITY;
