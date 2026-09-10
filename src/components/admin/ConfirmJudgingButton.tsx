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
// `heatId` (2026-09-10, только JUDGES_DANCE) — подтверждение ПО ЗАХОДУ
// (confirmFinalJudgeHeatDone) вместо round: заходы стадий там формируются не
// все сразу, общее "Готово" на весь раунд блокировало бы ещё не появившуюся
// стадию (см. JudgeHeatConfirmation в schema.prisma). Игнорируется, если
// final не передан.
export function ConfirmJudgingButton({ roundId, final = false, heatId }: { roundId: string; final?: boolean; heatId?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    const clickStartedAt = performance.now();
    setLoading(true);
    setError(null);
    const endpoint =
      final && heatId
        ? `/api/heats/${heatId}/confirm-final-judging`
        : final
          ? `/api/rounds/${roundId}/confirm-final-judging`
          : `/api/rounds/${roundId}/confirm-judging`;
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
      <Button type="button" size="touch" variant="admin" disabled={loading} onClick={onClick}>
        Готово
      </Button>
      {error && <span className="text-sm text-red-400">{error}</span>}
    </span>
  );
}
