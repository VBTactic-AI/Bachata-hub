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
//
// Оверлей-модалка вместо всегда развёрнутой формы (Stage R6 переноса
// UI-прототипа, 2026-09-19, единый модальный паттерн проекта).
export function FestivalPassBroadcastPanel({ festivalId, passes }: { festivalId: string; passes: BroadcastPassOption[] }) {
  const [open, setOpen] = useState(false);
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
      setTimeout(() => {
        setOpen(false);
        setResult(null);
      }, 1400);
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
    <div className="flex items-center justify-between gap-2 rounded-app border border-admin-border bg-admin-card p-4">
      <div>
        <h2 className="m-0 text-sm font-semibold uppercase tracking-wide text-admin-muted">Рассылка держателям Pass</h2>
      </div>
      <Button type="button" variant="adminOutline" size="sm" onClick={() => setOpen(true)}>
        Отправить рассылку
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5" onClick={() => !sending && setOpen(false)} role="presentation">
          <div
            className="flex max-h-[90vh] w-full max-w-[460px] flex-col overflow-hidden rounded-app border border-admin-border bg-admin-card shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="broadcast-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-admin-border px-5 py-4">
              <h3 id="broadcast-modal-title" className="m-0 text-[15px] font-extrabold text-night-text">
                Рассылка держателям Pass
              </h3>
            </div>

            <FormRoot onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto px-5 py-4">
                <div className="flex flex-col gap-3">
                  {error && <p className="m-0 text-sm text-red-400">{error}</p>}
                  {result && <p className="m-0 text-sm text-night-success">✓ {result}</p>}

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
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t border-admin-border px-5 py-4">
                <Button type="button" variant="adminOutline" onClick={() => setOpen(false)} disabled={sending}>
                  Отмена
                </Button>
                <Button type="submit" variant="admin" disabled={sending || !title.trim() || !body.trim()}>
                  {sending ? "Отправка…" : "Отправить"}
                </Button>
              </div>
            </FormRoot>
          </div>
        </div>
      )}
    </div>
  );
}
