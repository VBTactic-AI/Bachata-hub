"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormRoot, Input, Label, Select, Textarea } from "@/components/ui/field";

type City = { id: string; nameRu: string };

export function CreateCompetitionForm({ cities }: { cities: City[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [cityId, setCityId] = useState("");
  const [venue, setVenue] = useState("");
  const [startAt, setStartAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch("/api/competitions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description: description || undefined,
        cityId: cityId || undefined,
        venue: venue || undefined,
        startAt: startAt || undefined,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Что-то пошло не так.");
      return;
    }
    const data = await res.json();
    router.push(`/admin/competitions/${data.competition.id}`);
  }

  const fieldClass = "border-night-border bg-night-card text-night-text focus:border-night-primary focus:ring-night-primary/20";

  return (
    <FormRoot onSubmit={onSubmit} className="max-w-[560px]">
      <Label className="text-night-muted">
        Название
        <Input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Minsk Jack & Jill Open"
          className={fieldClass}
        />
      </Label>
      <Label className="text-night-muted">
        Город
        <Select value={cityId} onChange={(e) => setCityId(e.target.value)} className={fieldClass}>
          <option value="">—</option>
          {cities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nameRu}
            </option>
          ))}
        </Select>
      </Label>
      <Label className="text-night-muted">
        Площадка
        <Input value={venue} onChange={(e) => setVenue(e.target.value)} className={fieldClass} />
      </Label>
      <Label className="text-night-muted">
        Дата и время начала
        <Input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} className={fieldClass} />
      </Label>
      <Label className="text-night-muted">
        Описание
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className={fieldClass} />
      </Label>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <Button type="submit" disabled={loading} className="border-none bg-gradient-night-cta">
        Создать
      </Button>
    </FormRoot>
  );
}
