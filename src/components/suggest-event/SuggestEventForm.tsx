"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Select, Textarea, Label } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/DateField";

const FIELD_CLASS = "border-night-border bg-night-card text-night-text focus:border-night-primary focus:ring-night-primary/20";

// §7 ТЗ (Event Suggestions) — форма сознательно лёгкая (тот же принцип, что
// и в submit.ts): название + описание обязательны, город/дата/ссылка —
// необязательные подсказки. Не визард (в отличие от BecomeOrganizerWizard) —
// один экран, одна отправка.
export function SuggestEventForm({ cities }: { cities: { id: string; nameRu: string }[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [cityId, setCityId] = useState("");
  const [proposedDate, setProposedDate] = useState("");
  const [link, setLink] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/event-suggestions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        description,
        cityId: cityId || undefined,
        proposedDate: proposedDate || undefined,
        link: link || undefined,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.issues?.[0] || data.error || "Не удалось отправить предложение.");
      return;
    }
    setDone(true);
    setTitle("");
    setDescription("");
    setCityId("");
    setProposedDate("");
    setLink("");
    router.refresh();
  }

  if (done) {
    return (
      <div className="rounded-app border border-night-border bg-night-card p-4">
        <p className="m-0 font-semibold text-night-success">Спасибо! Предложение отправлено на проверку.</p>
        <p className="m-0 mt-1 text-sm text-night-muted">
          Мы посмотрим и, если всё ок, создадим это событие. Статус появится в списке ниже.
        </p>
        <Button type="button" size="sm" variant="adminOutline" className="mt-3" onClick={() => setDone(false)}>
          Предложить ещё одно
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex max-w-[520px] flex-col gap-3.5">
      <Label className="text-night-text">
        Название события
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          minLength={3}
          maxLength={160}
          placeholder="Например: Bachata Sensual Weekend"
          className={FIELD_CLASS}
        />
      </Label>
      <Label className="text-night-text">
        Что за событие, где и когда (то, что вы знаете)
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          minLength={10}
          maxLength={2000}
          placeholder="Видел(а) анонс в сторис, вроде будет в клубе X числа..."
          className={FIELD_CLASS}
        />
      </Label>
      <Label className="text-night-text">
        Город (если известен)
        <Select value={cityId} onChange={(e) => setCityId(e.target.value)} className={FIELD_CLASS}>
          <option value="">Не указан</option>
          {cities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nameRu}
            </option>
          ))}
        </Select>
      </Label>
      <Label className="text-night-text">
        Предполагаемая дата (если известна)
        <DateField value={proposedDate} onChange={setProposedDate} theme="night" className={FIELD_CLASS} placeholder="Не указана" />
      </Label>
      <Label className="text-night-text">
        Ссылка на анонс (пост в соцсети, сайт — необязательно)
        <Input
          type="url"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="https://..."
          className={FIELD_CLASS}
        />
      </Label>
      {error && <p className="m-0 text-sm text-red-400">{error}</p>}
      <Button type="submit" disabled={loading} className="border-none bg-gradient-night-cta">
        {loading ? "Отправляем…" : "Предложить событие"}
      </Button>
    </form>
  );
}
