"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { HeatStatus, RoundStatus } from "@prisma/client";

// Дублирует таблицу переходов src/server/state/heat-state.ts только для
// отображения кнопок — сервер проверяет допустимость и права сам.
const NEXT: Record<HeatStatus, HeatStatus[]> = {
  PENDING: ["RUNNING"],
  RUNNING: ["PAUSED", "FINISHED"],
  PAUSED: ["RUNNING"],
  FINISHED: [],
};

const ACTION_LABELS: Record<HeatStatus, string> = {
  PENDING: "",
  RUNNING: "Запустить",
  PAUSED: "Пауза",
  FINISHED: "Завершить",
};

export function HeatStatusControls({
  heatId,
  status,
  roundStatus,
}: {
  heatId: string;
  status: HeatStatus;
  // Заезд не может стартовать раньше собственного раунда (сервер это тоже
  // проверяет — это только чтобы не показывать кнопку, которая всё равно
  // будет отклонена).
  roundStatus: RoundStatus;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextOptions = (NEXT[status] ?? []).filter((to) => to !== "RUNNING" || roundStatus === "RUNNING");

  async function go(to: HeatStatus) {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/heats/${heatId}/transition`, {
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
    </span>
  );
}
