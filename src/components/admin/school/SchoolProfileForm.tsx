"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { t } from "@/lib/i18n/dictionary";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/field";

type Level = "BEGINNER" | "ALL_LEVELS" | "ADVANCED";
const ALL_LEVELS: Level[] = ["BEGINNER", "ALL_LEVELS", "ADVANCED"];

function csvToArray(s: string): string[] {
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}

const inputClass = "border-admin-border bg-admin-card2 text-night-text focus:border-admin-primary focus:ring-admin-primary/20";

export function SchoolProfileForm({
  schoolSlug,
  initial,
}: {
  schoolSlug: string;
  initial: {
    description: string | null;
    directions: string[];
    levels: Level[];
    contactPhone: string | null;
    contactEmail: string | null;
    website: string | null;
    instagram: string | null;
  };
}) {
  const router = useRouter();
  const [description, setDescription] = useState(initial.description ?? "");
  const [directionsCsv, setDirectionsCsv] = useState(initial.directions.join(", "));
  const [levels, setLevels] = useState<Level[]>(initial.levels);
  const [contactPhone, setContactPhone] = useState(initial.contactPhone ?? "");
  const [contactEmail, setContactEmail] = useState(initial.contactEmail ?? "");
  const [website, setWebsite] = useState(initial.website ?? "");
  const [instagram, setInstagram] = useState(initial.instagram ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function toggleLevel(l: Level) {
    setLevels((prev) => (prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l]));
  }

  async function save() {
    setLoading(true);
    setError(null);
    setSaved(false);
    const res = await fetch(`/api/schools/${schoolSlug}/profile`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: description || undefined,
        directions: csvToArray(directionsCsv),
        levels,
        contactPhone: contactPhone || undefined,
        contactEmail: contactEmail || undefined,
        website: website || undefined,
        instagram: instagram || undefined,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      setError("Не удалось сохранить изменения.");
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <Label className="text-admin-muted">
        Описание
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} />
      </Label>
      <Label className="text-admin-muted">
        Направления (через запятую)
        <Input value={directionsCsv} onChange={(e) => setDirectionsCsv(e.target.value)} className={inputClass} placeholder="Bachata, Sensual" />
      </Label>
      <div className="flex flex-col gap-1.5">
        <p className="m-0 text-sm text-admin-muted">Уровни</p>
        {ALL_LEVELS.map((l) => (
          <label key={l} className="flex items-center gap-2 text-sm text-night-text">
            <input type="checkbox" checked={levels.includes(l)} onChange={() => toggleLevel(l)} />
            {t.event.levels[l]}
          </label>
        ))}
      </div>
      <Label className="text-admin-muted">
        Телефон
        <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className={inputClass} />
      </Label>
      <Label className="text-admin-muted">
        Email
        <Input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className={inputClass} />
      </Label>
      <Label className="text-admin-muted">
        Website
        <Input value={website} onChange={(e) => setWebsite(e.target.value)} className={inputClass} />
      </Label>
      <Label className="text-admin-muted">
        Instagram
        <Input value={instagram} onChange={(e) => setInstagram(e.target.value)} className={inputClass} />
      </Label>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {saved && !error && <p className="text-sm text-night-success">Сохранено</p>}

      <Button type="button" disabled={loading} onClick={save} className="self-start border-none bg-gradient-admin-cta">
        Сохранить
      </Button>
    </div>
  );
}
