import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureBridgedUser } from "@/server/auth/bridge-user";

// Единственная точка входа для Google/Apple (и email-подтверждения по
// ссылке, если оно включено в Supabase) — сюда Supabase Auth редиректит
// браузер после провайдера с одноразовым `code` (PKCE).
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Тот же приём защиты от открытого редиректа, что и в src/app/login/page.tsx —
  // только относительный путь, без "//" (внешний хост через "//evil.com").
  const rawNext = searchParams.get("next") ?? "/";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=oauth_no_code`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/login?error=oauth_exchange_failed`);
  }

  // Apple не всегда возвращает email при повторных входах (и никогда —
  // display name после самого первого согласия); email в data.user.email —
  // то значение, которое Supabase уже сверил с провайдером, ему можно
  // доверять как идентификатору для связки/создания public.User.
  const email = data.user.email;
  if (!email) {
    // Структурно исключительная ситуация (провайдер обязан вернуть хотя бы
    // email при первом согласии) — не угадываем идентификатор, отправляем
    // на явную ошибку вместо тихого создания пользователя без email.
    return NextResponse.redirect(`${origin}/login?error=oauth_no_email`);
  }

  await ensureBridgedUser({ supabaseUserId: data.user.id, email });

  return NextResponse.redirect(`${origin}${next}`);
}
