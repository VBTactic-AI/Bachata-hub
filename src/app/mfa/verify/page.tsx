"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormRoot, Input, Label } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/client";

// Экран подтверждения кода при входе для УЖЕ настроенной MFA (в отличие от
// /mfa/setup — там фактора ещё нет). Различие важно: enroll() создавал бы
// ВТОРОЙ фактор поверх существующего, а challenge/verify требует конкретный
// factorId уже верифицированного фактора (см. listFactors() ниже).
export default function MfaVerifyPage() {
  return (
    <Suspense fallback={null}>
      <MfaVerifyForm />
    </Suspense>
  );
}

function MfaVerifyForm() {
  const router = useRouter();
  const next = useSearchParams().get("next");
  const redirectTo = next && next.startsWith("/") && !next.startsWith("//") ? next : "/admin";

  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data, error: listError } = await supabase.auth.mfa.listFactors();
      if (listError) {
        setError(listError.message);
        setLoading(false);
        return;
      }
      const totpFactor = data.totp[0];
      if (!totpFactor) {
        // Структурно не должно случаться (страница показывается только тем,
        // у кого MFA уже включена) — но не угадываем, явно сообщаем.
        setError("У вашего аккаунта не настроен ни один фактор MFA. Обратитесь к администратору.");
        setLoading(false);
        return;
      }
      setFactorId(totpFactor.id);
      setLoading(false);
    })();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setError(null);
    setVerifying(true);
    const supabase = createClient();
    const challenge = await supabase.auth.mfa.challenge({ factorId });
    if (challenge.error) {
      setError(challenge.error.message);
      setVerifying(false);
      return;
    }
    const verify = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.data.id,
      code: code.trim(),
    });
    setVerifying(false);
    if (verify.error) {
      setError(verify.error.message);
      return;
    }
    router.push(redirectTo);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="m-0 font-night text-2xl font-extrabold text-night-text">Двухфакторная аутентификация</h1>
        <p className="mt-2 text-sm text-night-muted">Введите код из приложения-аутентификатора.</p>
      </div>

      {loading && <p className="text-sm text-night-muted">Проверяем настройки MFA…</p>}

      {!loading && (
        <FormRoot onSubmit={onSubmit} className="max-w-none gap-3.5">
          <Label className="text-[0.7rem] font-semibold uppercase tracking-wider text-night-muted">
            Код из приложения
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              required
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="border-night-border bg-night-card text-night-text focus:border-night-primary focus:ring-night-primary/20"
            />
          </Label>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button
            type="submit"
            disabled={verifying || !factorId || code.length !== 6}
            className="mt-1 border-none bg-gradient-night-cta py-3.5"
          >
            Подтвердить
          </Button>
        </FormRoot>
      )}
    </div>
  );
}
