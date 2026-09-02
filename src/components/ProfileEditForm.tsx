"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { t } from "@/lib/i18n/dictionary";

type City = { id: string; nameRu: string };
type Dancer = {
  displayName: string;
  cityId: string | null;
  danceRole: "LEADER" | "FOLLOWER" | "BOTH" | null;
  selfLevel: "BEGINNER" | "ALL_LEVELS" | "ADVANCED" | null;
  avatarUrl: string | null;
};

export function ProfileEditForm({ dancer, cities }: { dancer: Dancer; cities: City[] }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(dancer.displayName);
  const [cityId, setCityId] = useState(dancer.cityId ?? "");
  const [danceRole, setDanceRole] = useState(dancer.danceRole ?? "");
  const [selfLevel, setSelfLevel] = useState(dancer.selfLevel ?? "");
  const [avatarUrl, setAvatarUrl] = useState(dancer.avatarUrl ?? "");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button className="btn btn-secondary btn-sm" type="button" onClick={() => setOpen(true)}>
        {t.dancer.editProfile}
      </button>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName, cityId, danceRole, selfLevel, avatarUrl }),
    });
    setLoading(false);
    if (!res.ok) {
      setError(t.common.errorGeneric);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="card">
      <label>
        {t.auth.displayName}
        <input required value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
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
        {t.dancer.roleLabel}
        <select value={danceRole} onChange={(e) => setDanceRole(e.target.value as typeof danceRole)}>
          <option value="">—</option>
          <option value="LEADER">{t.dancer.role.LEADER}</option>
          <option value="FOLLOWER">{t.dancer.role.FOLLOWER}</option>
          <option value="BOTH">{t.dancer.role.BOTH}</option>
        </select>
      </label>
      <label>
        {t.dancer.selfLevel}
        <select value={selfLevel} onChange={(e) => setSelfLevel(e.target.value as typeof selfLevel)}>
          <option value="">—</option>
          {Object.entries(t.event.levels).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t.dancer.avatarUrlLabel}
        <input type="url" value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} />
      </label>
      {error && <p className="error-text">{error}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-sm" type="submit" disabled={loading}>
          {t.common.save}
        </button>
        <button className="btn btn-secondary btn-sm" type="button" onClick={() => setOpen(false)}>
          {t.common.cancel}
        </button>
      </div>
    </form>
  );
}
