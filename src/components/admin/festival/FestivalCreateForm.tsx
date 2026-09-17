"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Select, Textarea, Label, FormRoot } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { DateTimeField } from "@/components/ui/DateTimeField";
import type { CityOption } from "./FestivalOverviewForm";

const FIELD_CLASS = "border-admin-border bg-admin-card2 text-night-text focus:border-admin-primary focus:ring-admin-primary/20";

export function FestivalCreateForm({ cities }: { cities: CityOption[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [cityId, setCityId] = useState(cities[0]?.id ?? "");
  const [venueName, setVenueName] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/festivals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description.trim() || null,
          cityId,
          venueName: venueName.trim() || null,
          startsAt: new Date(startsAt).toISOString(),
          endsAt: endsAt ? new Date(endsAt).toISOString() : null,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.message ?? "Не удалось создать фестиваль.");
        return;
      }
      router.push(`/admin/festival/${data.festival.id}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormRoot onSubmit={handleSubmit} className="max-w-[560px] rounded-app border border-admin-border bg-admin-card p-5">
      {error && <p className="m-0 text-sm text-red-400">{error}</p>}

      <Label>
        Название
        <Input className={FIELD_CLASS} value={name} onChange={(e) => setName(e.target.value)} required placeholder="Grodno Latina Fest" />
      </Label>

      <Label>
        Описание
        <Textarea className={FIELD_CLASS} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Label>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Label>
          Город
          <Select className={FIELD_CLASS} value={cityId} onChange={(e) => setCityId(e.target.value)} required>
            {cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nameRu}
              </option>
            ))}
          </Select>
        </Label>
        <Label>
          Площадка
          <Input className={FIELD_CLASS} value={venueName} onChange={(e) => setVenueName(e.target.value)} />
        </Label>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Label>
          Начало
          <DateTimeField value={startsAt} onChange={setStartsAt} theme="admin" className={FIELD_CLASS} required />
        </Label>
        <Label>
          Окончание
          <DateTimeField value={endsAt} onChange={setEndsAt} theme="admin" className={FIELD_CLASS} />
        </Label>
      </div>

      <Button type="submit" variant="admin" disabled={saving || !startsAt}>
        {saving ? "Создание…" : "Создать фестиваль"}
      </Button>
    </FormRoot>
  );
}
