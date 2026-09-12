import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Обновляет access/refresh-токены Supabase Auth на каждый запрос — без этого
// вызова серверные компоненты (которые не могут сами писать cookies) рано
// или поздно получат протухший токен и пользователя будет тихо разлогинивать.
// НЕ решает, кого пускать на какую страницу — в этом проекте это по-прежнему
// делает каждая страница/route сама через getCurrentUser()/getActor()
// (см. src/lib/auth.ts) — тот же принцип, что уже действовал с самописной
// сессией, менять не нужно (CLAUDE.md §54).
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options));
        },
      },
    }
  );

  // getClaims() (не getSession()!) — проверяет подпись JWT против публичных
  // ключей проекта заново при каждом вызове; это то немногое, ради чего
  // проход через middleware обязателен (см. предупреждение Supabase: без
  // этого пользователей может внезапно разлогинивать).
  await supabase.auth.getClaims();

  return supabaseResponse;
}
