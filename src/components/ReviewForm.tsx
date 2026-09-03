"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { t } from "@/lib/i18n/dictionary";
import { Button } from "@/components/ui/button";
import { FormRoot, Label, Select, Textarea } from "@/components/ui/field";

export function ReviewForm({ schoolSlug, loggedIn }: { schoolSlug: string; loggedIn: boolean }) {
  const router = useRouter();
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!loggedIn) {
    return (
      <p className="hint-text">
        <a href="/login">{t.nav.login}</a>, чтобы оставить отзыв.
      </p>
    );
  }

  if (done) return <p className="hint-text">{t.school.reviewThanks}</p>;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch(`/api/schools/${schoolSlug}/reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating, text }),
    });
    setLoading(false);
    if (!res.ok) {
      setError(t.common.errorGeneric);
      return;
    }
    setDone(true);
    router.refresh();
  }

  return (
    <FormRoot onSubmit={onSubmit}>
      <Label>
        {t.school.rating}
        <Select value={rating} onChange={(e) => setRating(Number(e.target.value))}>
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>
              {"★".repeat(n)}
              {"☆".repeat(5 - n)}
            </option>
          ))}
        </Select>
      </Label>
      <Label>
        {t.school.reviewText}
        <Textarea required minLength={3} value={text} onChange={(e) => setText(e.target.value)} />
      </Label>
      {error && <p className="error-text">{error}</p>}
      <Button type="submit" disabled={loading}>
        {t.school.addReview}
      </Button>
    </FormRoot>
  );
}
