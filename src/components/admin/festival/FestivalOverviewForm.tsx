"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Select, Textarea, Label, FormRoot } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { DateTimeField } from "@/components/ui/DateTimeField";

const FIELD_CLASS = "border-admin-border bg-admin-card2 text-night-text focus:border-admin-primary focus:ring-admin-primary/20";

export type CityOption = { id: string; nameRu: string };

export type FestivalOverviewValue = {
  id: string;
  name: string;
  description: string | null;
  cityId: string;
  venueName: string | null;
  startsAt: string; // ISO
  endsAt: string | null; // ISO
};

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 16);
}

// Редактирование основной информации фестиваля (перенос UI-макета, вкладка
// «Обзор», docs/PROGRESS.md — Festival Engine UI transfer). Инлайн-форма,
// без модалки — полей всего 6, отдельный экран/попап был бы избыточен.
export function FestivalOverviewForm({ festival, cities }: { festival: FestivalOverviewValue; cities: CityOption[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(festival.name);
  const [description, setDescription] = useState(festival.description ?? "");
  const [cityId, setCityId] = useState(festival.cityId);
  const [venueName, setVenueName] = useState(festival.venueName ?? "");
  const [startsAt, setStartsAt] = useState(toLocalInput(festival.startsAt));
  const [endsAt, setEndsAt] = useState(toLocalInput(festival.endsAt));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/festivals/${festival.id}`, {
        method: "PATCH",
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
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.message ?? "Не удалось сохранить изменения.");
        return;
      }
      setEditing(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className="rounded-app border border-admin-border bg-admin-card p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="m-0 text-sm font-semibold uppercase tracking-wide text-admin-muted">О фестивале</h2>
          <Button type="button" variant="adminOutline" size="sm" onClick={() => setEditing(true)}>
            ✎ Редактировать
          </Button>
        </div>
        <p className="m-0 mt-3 whitespace-pre-wrap text-sm text-night-text">{festival.description || "Описание пока не заполнено."}</p>
      </div>
    );
  }

  return (
    <FormRoot onSubmit={handleSubmit} className="max-w-none rounded-app border border-admin-border bg-admin-card p-4">
      <h2 className="m-0 text-sm font-semibold uppercase tracking-wide text-admin-muted">Редактирование фестиваля</h2>
      {error && <p className="m-0 text-sm text-red-400">{error}</p>}

      <Label>
        Название
        <Input className={FIELD_CLASS} value={name} onChange={(e) => setName(e.target.value)} required />
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

      <div className="flex gap-2">
        <Button type="submit" variant="admin" disabled={saving}>
          {saving ? "Сохранение…" : "Сохранить"}
        </Button>
        <Button type="button" variant="adminOutline" onClick={() => setEditing(false)} disabled={saving}>
          Отмена
        </Button>
      </div>
    </FormRoot>
  );
}
