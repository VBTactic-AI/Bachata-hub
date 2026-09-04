"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { t } from "@/lib/i18n/dictionary";
import { Button } from "@/components/ui/button";
import { FormRoot, Input, Label } from "@/components/ui/field";

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
  const next = useSearchParams().get("next");
  const redirectTo = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="stack max-w-[480px]">
      <h1 className="page-title">{t.auth.loginTitle}</h1>
      <FormRoot onSubmit={onSubmit}>
        <Label>
          {t.auth.email}
          <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Label>
        <Label>
          {t.auth.password}
          <Input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Label>
        {error && <p className="error-text">{error}</p>}
        <Button type="submit" disabled={loading}>
          {t.nav.login}
        </Button>
      </FormRoot>
    </div>
  );
}
