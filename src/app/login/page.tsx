"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { t } from "@/lib/i18n/dictionary";
import { Button } from "@/components/ui/button";
import { FormRoot, Input, Label } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/client";

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  oauth_no_code: t.auth.oauthNoCode,
  oauth_exchange_failed: t.auth.oauthExchangeFailed,
  oauth_no_email: t.auth.oauthNoEmail,
};

// useSearchParams() требует Suspense-границы при статической генерации
// (иначе весь /login принудительно уходит в CSR-bailout на сборке) —
// оборачиваем саму форму, а не всю страницу, чтобы fallback был минимальным.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  // ?next=... — вернуть туда, откуда пришли (напр. со страницы конкурса,
  // где нажали "Войти, чтобы зарегистрироваться"), а не всегда на главную.
  // Только относительный путь ("/..." ) — открытый редирект на чужой домен
  // через этот параметр исключён намеренно.
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const redirectTo = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const oauthErrorCode = searchParams.get("error");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    oauthErrorCode ? (OAUTH_ERROR_MESSAGES[oauthErrorCode] ?? null) : null
  );
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<"google" | "apple" | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setLoading(false);
    if (!res.ok) {
      setError(t.auth.invalidCredentials);
      return;
    }
    router.push(redirectTo);
    router.refresh();
  }

  async function onOAuthClick(provider: "google" | "apple") {
    setError(null);
    setOauthLoading(provider);
    const supabase = createClient();
    const callbackUrl = new URL("/auth/callback", window.location.origin);
    callbackUrl.searchParams.set("next", redirectTo);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: callbackUrl.toString() },
    });
    // При успехе supabase-js сам переводит браузер на страницу провайдера —
    // сюда управление возвращается только в случае ошибки ДО редиректа
    // (напр. провайдер не настроен в Supabase Dashboard).
    if (oauthError) {
      setOauthLoading(null);
      setError(oauthError.message);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="m-0 font-night text-2xl font-extrabold text-night-text">{t.auth.loginTitle}</h1>
      </div>
      <div className="flex flex-col gap-2.5">
        <Button
          type="button"
          disabled={oauthLoading !== null}
          onClick={() => onOAuthClick("google")}
          className="border border-night-border bg-night-card text-night-text hover:border-night-primary/60"
        >
          {t.auth.continueWithGoogle}
        </Button>
        <Button
          type="button"
          disabled={oauthLoading !== null}
          onClick={() => onOAuthClick("apple")}
          className="border border-night-border bg-night-card text-night-text hover:border-night-primary/60"
        >
          {t.auth.continueWithApple}
        </Button>
      </div>
      <div className="flex items-center gap-3 text-xs uppercase tracking-wider text-night-muted">
        <span className="h-px flex-1 bg-night-border" />
        {t.auth.orContinueWithEmail}
        <span className="h-px flex-1 bg-night-border" />
      </div>
      <FormRoot onSubmit={onSubmit} className="max-w-none gap-3.5">
        <Label className="text-[0.7rem] font-semibold uppercase tracking-wider text-night-muted">
          {t.auth.email}
          <Input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border-night-border bg-night-card text-night-text focus:border-night-primary focus:ring-night-primary/20"
          />
        </Label>
        <Label className="text-[0.7rem] font-semibold uppercase tracking-wider text-night-muted">
          {t.auth.password}
          <Input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="border-night-border bg-night-card text-night-text focus:border-night-primary focus:ring-night-primary/20"
          />
        </Label>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <Button type="submit" disabled={loading} className="mt-1 border-none bg-gradient-night-cta py-3.5">
          {t.nav.login}
        </Button>
      </FormRoot>
      <p className="text-center text-sm text-night-muted">
        Ещё нет аккаунта?{" "}
        <a href="/register" className="font-semibold text-night-primary">
          {t.nav.register}
        </a>
      </p>
    </div>
  );
}
