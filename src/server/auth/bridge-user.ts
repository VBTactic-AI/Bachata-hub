import { prisma } from "@/lib/prisma";

// Единая точка связки идентичности Supabase Auth (auth.users.id) с
// public.User — вызывается и из email-логина (signInWithPassword
// завершается сразу, без редиректа на /auth/callback), и из OAuth callback
// (Google/Apple всегда идут через редирект). Логика одна и та же в обоих
// случаях, поэтому вынесена сюда, а не продублирована.
//
// Правила (см. план миграции):
// 1. supabaseUserId уже привязан — обычный повторный вход.
// 2. Не привязан, но нашёлся public.User с таким email — это первый вход
//    через Supabase Auth уже существующего аккаунта (в т.ч. созданного до
//    перехода на Supabase Auth) — привязываем, НЕ создаём дубликат.
// 3. Не нашли нигде — действительно новый человек, роль по умолчанию DANCER
//    (роль никогда не берётся из OAuth-провайдера, CLAUDE.md/задача §3).
//
// Dancer-профиль здесь намеренно НЕ создаётся — тот же принцип, что уже
// применяется в registerSelf() (docs/00_DECISIONS.md, D9): профиль
// заводится лениво, когда он реально понадобился (регистрация на
// соревнование), а не сразу при первом входе, чтобы не угадывать
// displayName для OAuth-пользователя, у которого его может не быть вовсе
// (Apple, в частности, — см. заметку про private relay в плане).
export async function ensureBridgedUser(params: { supabaseUserId: string; email: string }): Promise<void> {
  const email = params.email.trim().toLowerCase();

  const alreadyLinked = await prisma.user.findUnique({ where: { supabaseUserId: params.supabaseUserId } });
  if (alreadyLinked) {
    await prisma.user.update({ where: { id: alreadyLinked.id }, data: { lastLoginAt: new Date() } });
    return;
  }

  const byEmail = await prisma.user.findUnique({ where: { email } });
  if (byEmail) {
    // Гонка исключена уникальным индексом User_supabaseUserId_key — если два
    // запроса одновременно попытаются привязать разные auth.users.id к
    // одной email-записи, второй получит ошибку уникальности, а не тихо
    // перезапишет первую привязку.
    await prisma.user.update({
      where: { id: byEmail.id },
      data: { supabaseUserId: params.supabaseUserId, lastLoginAt: new Date() },
    });
    return;
  }

  await prisma.user.create({
    data: {
      email,
      supabaseUserId: params.supabaseUserId,
      role: "DANCER",
      lastLoginAt: new Date(),
    },
  });
}
