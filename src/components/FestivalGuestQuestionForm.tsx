"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormRoot, Label, Input, Textarea } from "@/components/ui/field";

// Вопрос гостя фестивалю — АНОНИМНАЯ форма (без логина, прямое решение
// пользователя, Stage 3 сервисного слоя, festival-guest-question-service.ts).
// Анти-спам лимит по IP проверяется сервером — здесь просто показываем
// понятную ошибку, если сервер её вернул (429 — rate_limited).
export function FestivalGuestQuestionForm({ festivalId }: { festivalId: string }) {
  const router = useRouter();
  const [askerName, setAskerName] = useState("");
  const [question, setQuestion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  if (done) return <p className="text-sm text-night-muted">Спасибо! Ваш вопрос появится после проверки организатором.</p>;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch(`/api/festivals/${festivalId}/guest-questions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ askerName: askerName.trim() || null, question }),
    });
    const data = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok) {
      setError(res.status === 429 ? data?.message : "Не удалось отправить вопрос. Попробуйте ещё раз.");
      return;
    }
    setDone(true);
    router.refresh();
  }

  return (
    <FormRoot onSubmit={onSubmit}>
      <Label className="text-night-muted">
        Ваше имя (необязательно)
        <Input
          value={askerName}
          onChange={(e) => setAskerName(e.target.value)}
          className="border-night-border bg-night-card text-night-text focus:border-night-primary focus:ring-night-primary/20"
        />
      </Label>
      <Label className="text-night-muted">
        Вопрос
        <Textarea
          required
          minLength={3}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          className="border-night-border bg-night-card text-night-text focus:border-night-primary focus:ring-night-primary/20"
        />
      </Label>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <Button type="submit" disabled={loading} className="self-start border-none bg-gradient-night-cta">
        Задать вопрос
      </Button>
    </FormRoot>
  );
}
