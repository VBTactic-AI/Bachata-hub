"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

// Не "скрытие", а настоящее удаление — но только пока на дивизион нет ни
// одной регистрации (сервер это проверяет сам, docs/00_DECISIONS.md,
// 2026-09-04: сценарий "не набралось минимальное число участников").
export function DeleteDivisionButton({ divisionId, hasRegistrations }: { divisionId: string; hasRegistrations: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (hasRegistrations) return null;

  async function onDelete() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/divisions/${divisionId}`, { method: "DELETE" });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось удалить дивизион.");
      return;
    }
    router.refresh();
  }

  if (!confirming) {
    return (
      <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(true)}>
        удалить дивизион
      </Button>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <span className="hint-text">Удалить дивизион без единой регистрации?</span>
      <Button type="button" size="sm" variant="secondary" disabled={loading} onClick={onDelete}>
        Да, удалить
      </Button>
      <Button type="button" size="sm" variant="ghost" disabled={loading} onClick={() => setConfirming(false)}>
        отмена
      </Button>
      {error && <span className="error-text">{error}</span>}
    </span>
  );
}
