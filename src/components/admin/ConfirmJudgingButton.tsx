"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { perfFetch } from "@/lib/performance-debug/client";

// "Готово" по раунду формата "Да/Нет" (2026-09-04) — судья явно фиксирует
// свои оценки. Принимается только если "Да" ровно нужное число; иначе
// сервер вернёт понятную ошибку, ничего не меняется, кнопку можно нажать
// ещё раз после исправления.
export function ConfirmJudgingButton({ roundId }: { roundId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    const clickStartedAt = performance.now();
    setLoading(true);
    setError(null);
    const res = await perfFetch("judge.confirm_round", `/api/rounds/${roundId}/confirm-judging`, { method: "POST" }, clickStartedAt);
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Не удалось нажать "Готово".');
      return;
    }
    router.refresh();
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Button type="button" size="touch" disabled={loading} onClick={onClick} className="border-none bg-gradient-night-cta">
        Готово
      </Button>
      {error && <span className="text-sm text-red-400">{error}</span>}
    </span>
  );
}
