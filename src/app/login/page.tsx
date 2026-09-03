"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { t } from "@/lib/i18n/dictionary";
import { Button } from "@/components/ui/button";
import { FormRoot, Input, Label } from "@/components/ui/field";

export default function LoginPage() {
  const router = useRouter();
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
    router.push("/");
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
