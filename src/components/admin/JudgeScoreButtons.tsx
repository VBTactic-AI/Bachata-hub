"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

// Мобильный судейский UI (CLAUDE.md §40) — быстро выбрать оценку и увидеть
// статус отправки, без админских функций рядом.
export function JudgeScoreButtons({ drawParticipantId, maxValue, myScore }: { drawParticipantId: string; maxValue: number; myScore: number | null }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(myScore);

  async function submit(value: number) {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/draw-participants/${drawParticipantId}/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось сохранить оценку.");
      return;
    }
    setSaved(value);
    router.refresh();
  }

  const options = Array.from({ length: maxValue + 1 }, (_, v) => v);

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {options.map((v) => (
        <Button
          key={v}
          type="button"
          size="sm"
          variant={saved === v ? "default" : "outline"}
          disabled={loading}
          onClick={() => submit(v)}
        >
          {v}
        </Button>
      ))}
      {saved !== null && <span className="hint-text">сохранено</span>}
      {error && <span className="error-text">{error}</span>}
    </span>
  );
}
