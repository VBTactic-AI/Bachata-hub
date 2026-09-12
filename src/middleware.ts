import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Первый middleware.ts в проекте — до миграции на Supabase Auth его не было
// вообще (вся авторизация проверялась внутри route handlers/server
// components). Единственная задача здесь — держать токен сессии свежим
// (см. updateSession()); RBAC и роутинг доступа не меняются.
export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Не запускать middleware на статике/картинках/API Realtime-токенов и
     * т.п. — экономит обращение к Supabase на каждый такой запрос без
     * всякой пользы (сессия там не нужна).
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
