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
      ? "Начать стадию 1 (Ведущие)"
      : currentStage === 1
        ? "Завершить стадию 1 и начать стадию 2 (Ведомые)"
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
    <div className="rounded-app-sm border border-line p-3 mt-2 stack gap-1.5">
      <p className="m-0 font-semibold">Финал «Танец с судьями»</p>
      <p className="hint-text m-0">
        {currentStage === null && "Ещё не начат."}
        {currentStage === 1 && "Идёт стадия 1: ведущие финалисты танцуют с судьями-Ведомыми."}
        {currentStage === 2 && "Идёт стадия 2: ведомые финалистки танцуют с судьями-Ведущими."}
      </p>
      <Button type="button" size="sm" disabled={loading} onClick={onAdvance}>
        {label}
      </Button>
      {error && <span className="error-text">{error}</span>}
    </div>
  );
}
