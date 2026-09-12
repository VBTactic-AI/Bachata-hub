"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type MfaFactor = {
  id: string;
  friendly_name?: string | null;
  status: string;
};

// canRemoveAll=false (роль требует MFA) — не даём снять ПОСЛЕДНИЙ фактор,
// чтобы привилегированный аккаунт не остался без обязательной защиты
// (задача §6). Добавление второго фактора ("Добавить ещё устройство")
// разрешено всегда — это и есть безопасный способ восстановления при потере
// одного из устройств (§5 плана: несколько TOTP-факторов вместо
// recovery-кодов, которых Supabase Auth не предоставляет).
export function MfaFactorList({ factors, canRemoveAll }: { factors: MfaFactor[]; canRemoveAll: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [needsVerify, setNeedsVerify] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const canRemove = canRemoveAll || factors.length > 1;

  async function onRemove(factorId: string) {
    setError(null);
    setNeedsVerify(false);
    setRemovingId(factorId);
    const supabase = createClient();
    const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId });
    setRemovingId(null);
    if (unenrollError) {
      setError(unenrollError.message);
      // Supabase требует aal2, чтобы снять фактор — если сессия сейчас
      // только aal1 (обычный случай, когда роль не требует MFA и человек
      // просто зашёл в свои настройки), отправляем сначала подтвердить код.
      setNeedsVerify(true);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {factors.map((f) => (
          <li
            key={f.id}
            className="flex items-center justify-between rounded-app-sm border border-night-border bg-night-card2 px-3 py-2 text-sm text-night-text"
          >
            <span>{f.friendly_name || "Приложение-аутентификатор"}</span>
            {canRemove && (
              <button
                type="button"
                disabled={removingId === f.id}
                onClick={() => onRemove(f.id)}
                className="text-xs font-semibold text-red-400 hover:underline disabled:opacity-50"
              >
                Убрать
              </button>
            )}
          </li>
        ))}
      </ul>

      {error && (
        <p className="text-sm text-red-400">
          {error}
          {needsVerify && (
            <>
              {" "}
              <Link href="/mfa/verify?next=/profile/security" className="font-semibold text-night-primary">
                Подтвердить код
              </Link>
            </>
          )}
        </p>
      )}

      <Link href="/mfa/setup?next=/profile/security" className="text-sm font-semibold text-night-primary">
        + Добавить ещё устройство
      </Link>
    </div>
  );
}
