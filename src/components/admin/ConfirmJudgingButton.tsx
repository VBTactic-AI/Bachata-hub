"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { perfFetch } from "@/lib/performance-debug/client";

// "Готово" по раунду формата "Да/Нет"/"0/1/2" (2026-09-04, финал — 2026-09-07)
// — судья явно фиксирует свои оценки. Принимается только если распределение
// оценок точно совпадает с требуемым; иначе сервер вернёт понятную ошибку,
// ничего не меняется, кнопку можно нажать ещё раз после исправления.
// `final=true` переключает на эндпоинт финала (confirmFinalJudgeRoundDone,
// final-scoring.ts) — тот же компонент, чтобы не дублировать разметку/UX.
export function ConfirmJudgingButton({ roundId, final = false }: { roundId: string; final?: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    const clickStartedAt = performance.now();
    setLoading(true);
    setError(null);
    const endpoint = final ? `/api/rounds/${roundId}/confirm-final-judging` : `/api/rounds/${roundId}/confirm-judging`;
    const res = await perfFetch(final ? "judge.confirm_final_round" : "judge.confirm_round", endpoint, { method: "POST" }, clickStartedAt);
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
