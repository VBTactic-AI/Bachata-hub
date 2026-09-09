"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

// Прогресс стадий JUDGES_DANCE (промт пользователя, п.22-24) — одна кнопка
// "Далее", сервис сам решает, что делать по текущей стадии
// (final-judges-dance.ts, advanceJudgesDanceStage). Заменяет собой обычный
// список заходов (RoundStatusControls/HeatStatusControls/StartDrawingForm)
// для финалов этого формата — Draw Engine здесь не участвует (A5: партнёр
// участника — судья, не другой финалист).
export function JudgesDanceStagePanel({ roundId, currentStage }: { roundId: string; currentStage: number | null }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const label =
    currentStage === null
      ? "Начать стадию 1 (Партнёры)"
      : currentStage === 1
        ? "Завершить стадию 1 и начать стадию 2 (Партнёрши)"
        : "Завершить финал";

  async function onAdvance() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/rounds/${roundId}/judges-dance-advance`, { method: "POST" });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось перейти дальше.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="rounded-app-sm border border-admin-border bg-admin-card2 p-3 mt-2 stack gap-1.5">
      <p className="m-0 font-semibold text-night-text">Финал «Танец с судьями»</p>
      <p className="m-0 text-sm text-admin-muted">
        {currentStage === null && "Ещё не начат."}
        {currentStage === 1 && "Идёт стадия 1: финалисты-Партнёры танцуют с судьями-Партнёршами."}
        {currentStage === 2 && "Идёт стадия 2: финалистки-Партнёрши танцуют с судьями-Партнёрами."}
      </p>
      <Button type="button" size="sm" variant="admin" disabled={loading} onClick={onAdvance}>
        {label}
      </Button>
      {error && <span className="text-sm text-night-danger">{error}</span>}
    </div>
  );
}
