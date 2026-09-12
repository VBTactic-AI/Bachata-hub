import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Клиент Supabase Auth для Server Components / Route Handlers / Server
// Actions — читает cookies текущего запроса. Создаётся заново на каждый
// вызов (не глобальная переменная) — так рекомендует Supabase для fluid
// compute сред (Vercel и т.п.), где один и тот же модульный scope может
// обслуживать запросы разных пользователей.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // setAll() вызван из Server Component, которому нельзя писать
          // cookies — это ожидаемо и безопасно ИГНОРИРОВАТЬ здесь, пока
          // src/middleware.ts на каждый запрос обновляет токен раньше,
          // чем до сюда доходит выполнение (см. updateSession()).
        }
      },
    },
  });
}
