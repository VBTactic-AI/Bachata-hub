-- Переход аутентификации на Supabase Auth (Google/Apple/email + MFA) —
-- надстройка над существующим public."User", а не новая таблица:
-- supabaseUserId связывает auth.users.id с уже существующей моделью прав
-- (UserRole + движковый Role/Permission, docs/00_DECISIONS.md D2 — не
-- трогаем). passwordHash становится необязательным, т.к. у пользователей,
-- пришедших через Google/Apple/новый email-флоу Supabase, своего пароля в
-- этой БД никогда не будет — его хранит и проверяет сам Supabase Auth.

ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;
ALTER TABLE "User" ADD COLUMN "supabaseUserId" TEXT;

CREATE UNIQUE INDEX "User_supabaseUserId_key" ON "User"("supabaseUserId");
