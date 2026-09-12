"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormRoot, Input, Label } from "@/components/ui/field";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";

// Обязательная настройка MFA для SUPER_ADMIN/EVENT_ADMIN (и сайтового
// ADMIN-моста) — src/server/mfa/policy.ts. Сама страница ничего не решает
// о том, кому это обязательно, а кому нет — сервер (requirePermission())
// откажет в привилегированном действии, пока сессия не поднимется до aal2,
// независимо от того, зашёл ли пользователь сюда сам. Эта страница — просто
// самый удобный путь пройти enroll/challenge/verify (задача §3/§8).
export default function MfaSetupPage() {
  return (
    <Suspense fallback={null}>
      <MfaSetupForm />
    </Suspense>
  );
}

function MfaSetupForm() {
  const router = useRouter();
  const next = useSearchParams().get("next");
  const redirectTo = next && next.startsWith("/") && !next.startsWith("//") ? next : "/admin";

  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      // enroll() создаёт unverified-фактор — до verify() он ни на что не
      // влияет (задача §3: MFA не считается включённой до успешной проверки).
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `Устройство от ${new Date().toLocaleDateString("ru-RU")}`,
      });
      if (enrollError) {
        setError(enrollError.message);
        setLoading(false);
        return;
      }
      setFactorId(data.id);
      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
      setLoading(false);
    })();
  }, []);

  async function onVerify(e: React.FormEvent) {
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
    // Успешная verify() сама поднимает текущую сессию до aal2 (документация
    // Supabase) — дальше просто уходим на защищённую страницу.
    router.push(redirectTo);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="m-0 font-night text-2xl font-extrabold text-night-text">Настройка двухфакторной аутентификации</h1>
        <p className="mt-2 text-sm text-night-muted">
          Для вашей роли обязательна MFA. Отсканируйте QR-код приложением-аутентификатором (Google Authenticator, Apple
          Passwords, 1Password, Authy) и введите 6-значный код.
        </p>
      </div>

      {loading && <p className="text-sm text-night-muted">Готовим QR-код…</p>}

      {!loading && qrCode && (
        <Card className="flex flex-col items-center gap-3 border-night-border bg-night-card p-5">
          {/* eslint-disable-next-line @next/next/no-img-element -- SVG data-URL от Supabase, не файл из /public */}
          <img src={qrCode} alt="QR-код для приложения-аутентификатора" className="h-48 w-48 rounded-app-sm bg-white p-2" />
          {secret && (
            <p className="text-center text-xs text-night-muted">
              Не получается отсканировать? Введите ключ вручную:
              <br />
              <code className="text-night-text">{secret}</code>
            </p>
          )}
        </Card>
      )}

      <FormRoot onSubmit={onVerify} className="max-w-none gap-3.5">
        <Label className="text-[0.7rem] font-semibold uppercase tracking-wider text-night-muted">
          Код из приложения
          <Input
            inputMode="numeric"
            autoComplete="one-time-code"
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
    </div>
  );
}
