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
      // Ошибка — первой, слева от вопроса и кнопок (по прямому запросу
      // пользователя, 2026-09-09) — кнопки не переносят подпись
      // (whitespace-nowrap в button.tsx), при нехватке места переносится вся
      // строка целиком (flex-wrap), не текст внутри кнопки.
      <span className="inline-flex flex-wrap items-center gap-2">
        {error && <span className="text-xs text-red-400">{error}</span>}
        <span className="text-sm text-admin-muted">Удалить текущие раунды и собрать заново по плану?</span>
        <Button type="button" size="sm" variant="admin" disabled={loading} onClick={run}>
          Да, перегенерировать
        </Button>
        <Button type="button" size="sm" variant="ghost" className="text-admin-muted hover:text-admin-primaryHover" disabled={loading} onClick={() => setConfirming(false)}>
          отмена
        </Button>
      </span>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {error && <span className="text-xs text-red-400">{error}</span>}
      <Button type="button" size="sm" variant="adminOutline" disabled={loading} onClick={() => (hasExistingRounds ? setConfirming(true) : run())}>
        {hasExistingRounds ? "Перегенерировать раунды" : "Сгенерировать раунды"}
      </Button>
    </span>
  );
}
