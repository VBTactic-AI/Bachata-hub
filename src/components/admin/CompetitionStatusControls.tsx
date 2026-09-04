"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { CompetitionStatus } from "@prisma/client";

// Дублирует таблицу переходов из src/server/state/competition-state.ts —
// здесь только для отображения доступных кнопок. Реальная проверка
// допустимости перехода и прав выполняется на сервере (CLAUDE.md §53) —
// если пользователь как-то вызовет недопустимый переход в обход UI, API
// его всё равно отклонит. REVIEW -> PUBLISHED убран (Этап 10) — публикация
// результатов теперь отдельная проверенная операция, см. CompetitionResultsPanel.
const NEXT: Record<CompetitionStatus, CompetitionStatus[]> = {
  DRAFT: ["REGISTRATION_OPEN"],
  REGISTRATION_OPEN: ["REGISTRATION_CLOSED"],
  REGISTRATION_CLOSED: ["CHECK_IN"],
  CHECK_IN: ["READY"],
  READY: ["LIVE"],
  LIVE: ["SCORING"],
  SCORING: ["REVIEW"],
  REVIEW: [],
  PUBLISHED: ["ARCHIVED"],
  ARCHIVED: [],
};

const ACTION_LABELS: Record<CompetitionStatus, string> = {
  DRAFT: "Вернуть в черновик",
  REGISTRATION_OPEN: "Открыть регистрацию",
  REGISTRATION_CLOSED: "Закрыть регистрацию",
  CHECK_IN: "Начать check-in",
  READY: "Отметить готовность",
  LIVE: "Запустить",
  SCORING: "Начать судейство",
  REVIEW: "Отправить на проверку",
  PUBLISHED: "Опубликовать результаты",
  ARCHIVED: "В архив",
};

export function CompetitionStatusControls({
  competitionId,
  status,
}: {
  competitionId: string;
  status: CompetitionStatus;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextOptions = NEXT[status] ?? [];

  async function go(to: CompetitionStatus) {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/competitions/${competitionId}/transition`, {
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

  if (nextOptions.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {nextOptions.map((to) => (
        <Button key={to} type="button" size="sm" disabled={loading} onClick={() => go(to)}>
          {ACTION_LABELS[to]}
        </Button>
      ))}
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
