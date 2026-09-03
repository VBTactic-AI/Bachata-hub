"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { t } from "@/lib/i18n/dictionary";
import { Button } from "@/components/ui/button";
import { FormRoot, Input, Label, Select } from "@/components/ui/field";

type City = { id: string; nameRu: string };

export function RegisterForm({ cities }: { cities: City[] }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"DANCER" | "SCHOOL_REP" | "ORGANIZER">("DANCER");
  const [cityId, setCityId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError(t.auth.passwordMismatch);
      return;
    }
    setLoading(true);
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName, role, cityId }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error === "email_taken" ? t.auth.emailTaken : t.common.errorGeneric);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <FormRoot onSubmit={onSubmit}>
      <Label>
        {t.auth.displayName}
        <Input required value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      </Label>
      <Label>
        {t.auth.email}
        <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </Label>
      <Label>
        {t.auth.password}
        <Input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Label>
      <Label>
        {t.auth.confirmPassword}
        <Input
          type="password"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
      </Label>
      <Label>
        {t.city.choose}
        <Select value={cityId} onChange={(e) => setCityId(e.target.value)}>
          <option value="">—</option>
          {cities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nameRu}
            </option>
          ))}
        </Select>
      </Label>
      <Label>
        {t.auth.registerAs}
        <Select value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
          <option value="DANCER">{t.auth.roleDancer}</option>
          <option value="SCHOOL_REP">{t.auth.roleSchoolRep}</option>
          <option value="ORGANIZER">{t.auth.roleOrganizer}</option>
        </Select>
      </Label>
      {role === "SCHOOL_REP" && <p className="hint-text">{t.auth.schoolRepHint}</p>}
      {error && <p className="error-text">{error}</p>}
      <Button type="submit" disabled={loading}>
        {t.nav.register}
      </Button>
    </FormRoot>
  );
}
