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

  return (
    <FormRoot onSubmit={onSubmit} className="max-w-[560px]">
      <Label>
        Название
        <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Minsk Jack & Jill Open" />
      </Label>
      <Label>
        Город
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
        Площадка
        <Input value={venue} onChange={(e) => setVenue(e.target.value)} />
      </Label>
      <Label>
        Дата и время начала
        <Input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
      </Label>
      <Label>
        Описание
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
      </Label>
      {error && <p className="error-text">{error}</p>}
      <Button type="submit" disabled={loading}>
        Создать
      </Button>
    </FormRoot>
  );
}
