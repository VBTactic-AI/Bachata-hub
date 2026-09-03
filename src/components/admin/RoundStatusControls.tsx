"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { RoundStatus } from "@prisma/client";
import { ROUND_STATUS_LABELS } from "@/lib/competition-labels";

// Дублирует таблицу переходов src/server/state/round-state.ts только для
// отображения кнопок — сервер проверяет допустимость сам (CLAUDE.md §53).
// DRAWING/DRAW_LOCKED сознательно показываются: guard на сервере отклонит их
// понятным сообщением "требует Draw Engine" (этап 5), а не скрывает кнопку.
const NEXT: Record<RoundStatus, RoundStatus[]> = {
  DRAFT: ["READY"],
  READY: ["DRAWING"],
  DRAWING: ["DRAW_LOCKED"],
  DRAW_LOCKED: ["RUNNING"],
  RUNNING: ["PAUSED", "FINISHED"],
  PAUSED: ["RUNNING"],
  FINISHED: ["SCORING"],
  SCORING: ["COMPLETED"],
  COMPLETED: [],
};

const ACTION_LABELS: Record<RoundStatus, string> = {
  DRAFT: "Вернуть в черновик",
  READY: "Отметить готовность",
  DRAWING: "Начать жеребьёвку",
  DRAW_LOCKED: "Зафиксировать жеребьёвку",
  RUNNING: "Запустить",
  PAUSED: "Пауза",
  FINISHED: "Завершить",
  SCORING: "Начать судейство",
  COMPLETED: "Завершить судейство",
};

export function RoundStatusControls({ roundId, status }: { roundId: string; status: RoundStatus }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextOptions = NEXT[status] ?? [];

  async function go(to: RoundStatus) {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/rounds/${roundId}/transition`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось выполнить переход.");
      return;
    }
    router.refresh();
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {nextOptions.map((to) => (
        <Button key={to} type="button" size="sm" variant="secondary" disabled={loading} onClick={() => go(to)}>
          {ACTION_LABELS[to]}
        </Button>
      ))}
      {error && <span className="error-text">{error}</span>}
      {nextOptions.length === 0 && <span className="hint-text">{ROUND_STATUS_LABELS[status]}</span>}
    </span>
  );
}
