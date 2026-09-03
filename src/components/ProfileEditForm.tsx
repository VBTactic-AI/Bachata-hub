"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { t } from "@/lib/i18n/dictionary";
import { Button } from "@/components/ui/button";
import { FormRoot, Input, Label, Select } from "@/components/ui/field";

type City = { id: string; nameRu: string };
type Dancer = {
  displayName: string;
  cityId: string | null;
  gender: "MALE" | "FEMALE" | null;
  danceRole: "LEADER" | "FOLLOWER" | "BOTH" | null;
  selfLevel: "BEGINNER" | "ALL_LEVELS" | "ADVANCED" | null;
  avatarUrl: string | null;
};

export function ProfileEditForm({ dancer, cities }: { dancer: Dancer; cities: City[] }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(dancer.displayName);
  const [cityId, setCityId] = useState(dancer.cityId ?? "");
  const [gender, setGender] = useState(dancer.gender ?? "");
  const [danceRole, setDanceRole] = useState(dancer.danceRole ?? "");
  const [selfLevel, setSelfLevel] = useState(dancer.selfLevel ?? "");
  const [avatarUrl, setAvatarUrl] = useState(dancer.avatarUrl ?? "");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <Button variant="secondary" size="sm" type="button" onClick={() => setOpen(true)}>
        {t.dancer.editProfile}
      </Button>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName, cityId, gender, danceRole, selfLevel, avatarUrl }),
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
    <FormRoot onSubmit={onSubmit} className="rounded-app border border-line bg-surface p-[18px] shadow-sm">
      <Label>
        {t.auth.displayName}
        <Input required value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
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
        {t.dancer.genderLabel}
        <Select value={gender} onChange={(e) => setGender(e.target.value as typeof gender)}>
          <option value="">—</option>
          <option value="MALE">{t.dancer.gender.MALE}</option>
          <option value="FEMALE">{t.dancer.gender.FEMALE}</option>
        </Select>
      </Label>
      <p className="hint-text -mt-2">{t.dancer.genderHint}</p>
      <Label>
        {t.dancer.roleLabel}
        <Select value={danceRole} onChange={(e) => setDanceRole(e.target.value as typeof danceRole)}>
          <option value="">—</option>
          <option value="LEADER">{t.dancer.role.LEADER}</option>
          <option value="FOLLOWER">{t.dancer.role.FOLLOWER}</option>
          <option value="BOTH">{t.dancer.role.BOTH}</option>
        </Select>
      </Label>
      <Label>
        {t.dancer.selfLevel}
        <Select value={selfLevel} onChange={(e) => setSelfLevel(e.target.value as typeof selfLevel)}>
          <option value="">—</option>
          {Object.entries(t.event.levels).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </Select>
      </Label>
      <Label>
        {t.dancer.avatarUrlLabel}
        <Input type="url" value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} />
      </Label>
      {error && <p className="error-text">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" type="submit" disabled={loading}>
          {t.common.save}
        </Button>
        <Button variant="secondary" size="sm" type="button" onClick={() => setOpen(false)}>
          {t.common.cancel}
        </Button>
      </div>
    </FormRoot>
  );
}
