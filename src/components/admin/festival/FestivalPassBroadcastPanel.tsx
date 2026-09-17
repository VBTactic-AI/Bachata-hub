"use client";

import { useState } from "react";
import { Select, Input, Textarea, Label, FormRoot } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

const FIELD_CLASS = "border-admin-border bg-admin-card2 text-night-text focus:border-admin-primary focus:ring-admin-primary/20";

export type BroadcastPassOption = { id: string; name: string };

// Рассылка держателям конкретного Pass (Stage 5 сервисного слоя,
// festival-broadcast-service.ts) — НЕ сайтовый BroadcastComposer (тот
// инструмент только для ADMIN и работает по всем Pass сайта). clientRequestId
// генерируется при каждой отправке — идемпотентность на стороне
// sendBroadcast() (broadcast.ts), защита от двойного клика/сетевого ретрая.
export function FestivalPassBroadcastPanel({ festivalId, passes }: { festivalId: string; passes: BroadcastPassOption[] }) {
  const [passId, setPassId] = useState(passes[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    setResult(null);
    try {
      const clientRequestId = crypto.randomUUID();
      const res = await fetch(`/api/festivals/${festivalId}/passes/${passId}/broadcast`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body, clientRequestId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.message ?? "Не удалось отправить рассылку.");
        return;
      }
      setResult(`Отправлено ${data.recipientCount} получателям.`);
      setTitle("");
      setBody("");
    } finally {
      setSending(false);
    }
  }

  if (passes.length === 0) {
    return (
      <div className="rounded-app border border-admin-border bg-admin-card p-4">
        <h2 className="m-0 text-sm font-semibold uppercase tracking-wide text-admin-muted">Рассылка держателям Pass</h2>
        <p className="m-0 mt-2 text-sm text-admin-muted">Создайте хотя бы один Pass, чтобы можно было разослать сообщение его держателям.</p>
      </div>
    );
  }

  return (
    <div className="rounded-app border border-admin-border bg-admin-card p-4">
      <h2 className="m-0 mb-3 text-sm font-semibold uppercase tracking-wide text-admin-muted">Рассылка держателям Pass</h2>

      <FormRoot onSubmit={handleSubmit} className="max-w-none">
        {error && <p className="m-0 text-sm text-red-400">{error}</p>}
        {result && <p className="m-0 text-sm text-night-success">{result}</p>}

        <Label className="text-admin-muted">
          Pass
          <Select value={passId} onChange={(e) => setPassId(e.target.value)} className={FIELD_CLASS}>
            {passes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Label>

        <Label className="text-admin-muted">
          Заголовок
          <Input value={title} onChange={(e) => setTitle(e.target.value)} className={FIELD_CLASS} placeholder="Изменение в расписании" required />
        </Label>

        <Label className="text-admin-muted">
          Текст
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} className={FIELD_CLASS} rows={3} required />
        </Label>

        <Button type="submit" variant="admin" disabled={sending || !title.trim() || !body.trim()}>
          {sending ? "Отправка…" : "Отправить"}
        </Button>
      </FormRoot>
    </div>
  );
}
