"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

// "Способ Б" (в отличие от "+ Помощник" — помощь в рамках одного заезда):
// избыток переносится в новый заезд этого же раунда, помощники текущего
// заезда удаляются, новый заезд сам добирает недостающую сторону —
// сначала своими только что освободившимися, потом каскадом по категориям
// выше (docs/00_DECISIONS.md, A10).
export function SplitHeatButton({ heatId }: { heatId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/heats/${heatId}/split`, { method: "POST" });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось разбить заход.");
      return;
    }
    router.refresh();
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Button type="button" size="sm" variant="outline" disabled={loading} onClick={submit}>
        Разбить на 2 выхода
      </Button>
      {error && <span className="error-text">{error}</span>}
    </span>
  );
}
