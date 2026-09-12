import { createClient } from "@supabase/supabase-js";

// СЕРВЕР-ONLY. Service-role ключ обходит RLS и Storage-политики полностью —
// не путать с src/lib/supabase/{client,server}.ts (anon key, Auth). Единственное
// текущее применение — управляемая сервером загрузка афиш события в Storage
// (src/server/events/event-images-service.ts): загрузку инициирует только наш
// API route после собственной RBAC/ownership-проверки, само хранилище о
// пользователе ничего не знает и никому напрямую не открыто на запись.
// Никогда не импортировать этот модуль из клиентского компонента и не
// возвращать сам ключ клиенту (CLAUDE.md §43, AUTH_SECURITY_SPEC.md §31).
export function createAdminClient() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY не настроены");
  }
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
