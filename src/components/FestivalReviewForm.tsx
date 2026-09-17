"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormRoot, Label, Select, Textarea } from "@/components/ui/field";

// Отзыв о фестивале — та же UX, что и ReviewForm.tsx (отзыв о школе), но
// свой компонент: разные endpoint/RBAC (festival-review-service.ts,
// требует логин — Review.authorId обязателен, Stage 3 сервисного слоя) и
// свой набор i18n-строк школьного компонента здесь не подходит по смыслу.
export function FestivalReviewForm({ festivalId, loggedIn }: { festivalId: string; loggedIn: boolean }) {
  const router = useRouter();
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!loggedIn) {
    return (
      <p className="text-sm text-night-muted">
        <a href="/login" className="text-night-primary">
          Войдите
        </a>
        , чтобы оставить отзыв.
      </p>
    );
  }

  if (done) return <p className="text-sm text-night-muted">Спасибо за отзыв! Он появится после проверки организатором.</p>;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch(`/api/festivals/${festivalId}/reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating, text }),
    });
    setLoading(false);
    if (!res.ok) {
      setError("Не удалось отправить отзыв. Попробуйте ещё раз.");
      return;
    }
    setDone(true);
    router.refresh();
  }

  return (
    <FormRoot onSubmit={onSubmit}>
      <Label className="text-night-muted">
        Оценка
        <Select
          value={rating}
          onChange={(e) => setRating(Number(e.target.value))}
          className="border-night-border bg-night-card text-night-text focus:border-night-primary focus:ring-night-primary/20"
        >
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>
              {"★".repeat(n)}
              {"☆".repeat(5 - n)}
            </option>
          ))}
        </Select>
      </Label>
      <Label className="text-night-muted">
        Текст отзыва
        <Textarea
          required
          minLength={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="border-night-border bg-night-card text-night-text focus:border-night-primary focus:ring-night-primary/20"
        />
      </Label>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <Button type="submit" disabled={loading} className="self-start border-none bg-gradient-night-cta">
        Оставить отзыв
      </Button>
    </FormRoot>
  );
}
