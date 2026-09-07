import { SignJWT } from "jose";

// Короткоживущий JWT, дающий браузеру право подписаться НАПРЯМУЮ на
// Supabase Realtime (postgres_changes) для JudgeScore/FinalJudgeScore ОДНОГО
// конкретного раунда — RLS-политика "realtime_read_by_round_token"
// (миграция 20260907020000) сверяет claim "roundId" с реальным раундом
// каждой строки. Подписывается СЕКРЕТОМ САМОГО SUPABASE-ПРОЕКТА
// (SUPABASE_JWT_SECRET, Dashboard → API → JWT Settings) — это не тот же
// секрет, что SESSION_SECRET/NEXTAUTH_SECRET (сессии этого приложения);
// Supabase проверяет подпись именно этим секретом, когда решает, доверять
// ли claims внутри auth.jwt().
//
// Выдаётся ТОЛЬКО после обычной проверки requirePermission("score:view_all",
// ...) вызывающим кодом (route handler) — эта функция сама прав не проверяет,
// только подписывает то, что ей передали.
const ROUND_TOKEN_TTL_SECONDS = 600; // 10 минут — короче, чем сессия приложения, чтобы отозванный доступ не жил долго

export async function mintRoundRealtimeToken(userId: string, roundId: string): Promise<{ token: string; expiresInSeconds: number }> {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    throw new Error(
      "SUPABASE_JWT_SECRET не задан — live-обновления таблицы оценок недоступны (см. .env.example: Supabase Dashboard → API → JWT Settings → JWT Secret)."
    );
  }
  const token = await new SignJWT({ role: "authenticated", roundId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${ROUND_TOKEN_TTL_SECONDS}s`)
    .sign(new TextEncoder().encode(secret));

  return { token, expiresInSeconds: ROUND_TOKEN_TTL_SECONDS };
}
