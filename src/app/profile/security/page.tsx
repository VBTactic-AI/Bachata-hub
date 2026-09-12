import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getActor } from "@/server/rbac/actor";
import { createClient } from "@/lib/supabase/server";
import { MfaFactorList } from "@/components/profile/MfaFactorList";

// Раздел "Безопасность" (задача §6) — статус MFA + управление факторами.
// Доступен любому вошедшему пользователю (не только тем, у кого MFA
// обязательна) — Phase 6/8 явно требуют MFA как ОПЦИЮ для остальных ролей,
// не только как обязаловку для SUPER_ADMIN/EVENT_ADMIN.
export default async function ProfileSecurityPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const actor = await getActor();
  const mfaRequired = actor?.mfaRequired ?? false;

  const supabase = await createClient();
  const { data } = await supabase.auth.mfa.listFactors();
  const totpFactors = (data?.totp ?? []).filter((f: { status: string }) => f.status === "verified");

  return (
    <div className="flex flex-col gap-5">
      <h1 className="m-0 font-night text-xl font-extrabold text-night-text">Безопасность</h1>

      <div className="rounded-app border border-night-border bg-night-card p-4">
        <h2 className="m-0 mb-1 font-night text-base font-bold text-night-text">Двухфакторная аутентификация (MFA)</h2>
        <p className="mb-3 text-sm text-night-muted">
          {mfaRequired
            ? "Для вашей роли MFA обязательна — отключить её нельзя."
            : "Необязательна для вашей роли, но рекомендуется."}
        </p>

        {totpFactors.length === 0 ? (
          <Link
            href="/mfa/setup?next=/profile/security"
            className="inline-block rounded-app-sm bg-gradient-night-cta px-4 py-2 text-sm font-semibold text-white no-underline"
          >
            Настроить MFA
          </Link>
        ) : (
          <MfaFactorList factors={totpFactors} canRemoveAll={!mfaRequired} />
        )}
      </div>
    </div>
  );
}
