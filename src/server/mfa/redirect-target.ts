import { createClient } from "@/lib/supabase/server";

// Куда отправить пользователя, которому сервер отказал в привилегированном
// действии из-за недостаточного assurance level (MfaRequiredError/
// mfaGateForSiteRole) — на настройку (фактора ещё нет) или на подтверждение
// (фактор уже есть, нужен только код). Один сетевой вызов к Supabase Auth на
// вход в защищённую страницу — не на каждое действие внутри неё (Phase 9).
export async function mfaRedirectPath(nextPath: string): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase.auth.mfa.listFactors();
  const hasVerifiedTotp = (data?.totp ?? []).some((f: { status: string }) => f.status === "verified");
  const target = hasVerifiedTotp ? "/mfa/verify" : "/mfa/setup";
  return `${target}?next=${encodeURIComponent(nextPath)}`;
}
