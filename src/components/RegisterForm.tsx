"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { t } from "@/lib/i18n/dictionary";

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
    <form onSubmit={onSubmit}>
      <label>
        {t.auth.displayName}
        <input required value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      </label>
      <label>
        {t.auth.email}
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label>
        {t.auth.password}
        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      <label>
        {t.auth.confirmPassword}
        <input
          type="password"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
      </label>
      <label>
        {t.city.choose}
        <select value={cityId} onChange={(e) => setCityId(e.target.value)}>
          <option value="">—</option>
          {cities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nameRu}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t.auth.registerAs}
        <select value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
          <option value="DANCER">{t.auth.roleDancer}</option>
          <option value="SCHOOL_REP">{t.auth.roleSchoolRep}</option>
          <option value="ORGANIZER">{t.auth.roleOrganizer}</option>
        </select>
      </label>
      {role === "SCHOOL_REP" && <p className="hint-text">{t.auth.schoolRepHint}</p>}
      {error && <p className="error-text">{error}</p>}
      <button className="btn" type="submit" disabled={loading}>
        {t.nav.register}
      </button>
    </form>
  );
}
