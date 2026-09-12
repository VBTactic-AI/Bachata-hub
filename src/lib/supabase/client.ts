import { createBrowserClient } from "@supabase/ssr";

// Клиент Supabase Auth для браузера (Client Components) — используется
// только для интерактивных вызовов, которым обязательно нужен браузерный
// контекст (OAuth-редирект `signInWithOAuth`, экран MFA
// enroll/challenge/verify через `supabase.auth.mfa.*`). Обычные
// серверные проверки идут через src/lib/supabase/server.ts, не через этот
// файл — см. его комментарий.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    // Официально сейчас называется "publishable key", но в этом проекте уже
    // провизирован "legacy" anon-ключ (см. .env.example) — Supabase явно
    // подтверждает поддержку anon/service_role минимум до конца 2026 года,
    // отдельно заводить новую переменную ради переименования не нужно.
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
