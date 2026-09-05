"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { perfFetch } from "@/lib/performance-debug/client";

// Если у дивизиона уже есть раунды, сервер их не дополняет, а заменяет
// (docs/00_DECISIONS.md, A14) — удаляет старые и строит заново по плану
// дивизиона. Разрешено только пока ни один раунд не начат; подтверждение
// нужно только в этом случае — первая генерация ничего не удаляет.
export function GenerateRoundsButton({ divisionId, hasExistingRounds }: { divisionId: string; hasExistingRounds: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    const clickStartedAt = performance.now();
    setLoading(true);
    setError(null);
    const res = await perfFetch(
      "admin.generate_rounds",
      `/api/divisions/${divisionId}/generate-rounds`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) },
      clickStartedAt
    );
    setLoading(false);
    setConfirming(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось перегенерировать раунды.");
      return;
    }
    router.refresh();
  }

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="hint-text">Удалить текущие раунды и собрать заново по плану?</span>
        <Button type="button" size="sm" variant="secondary" disabled={loading} onClick={run}>
          Да, перегенерировать
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={loading} onClick={() => setConfirming(false)}>
          отмена
        </Button>
        {error && <span className="error-text">{error}</span>}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Button type="button" size="sm" disabled={loading} onClick={() => (hasExistingRounds ? setConfirming(true) : run())}>
        {hasExistingRounds ? "Перегенерировать раунды" : "Сгенерировать раунды"}
      </Button>
      {error && <span className="error-text">{error}</span>}
    </span>
  );
}
