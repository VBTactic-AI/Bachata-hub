"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { perfFetch } from "@/lib/performance-debug/client";

export function AddHeatButton({ roundId }: { roundId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    const clickStartedAt = performance.now();
    setLoading(true);
    setError(null);
    const res = await perfFetch(
      "admin.create_heat",
      `/api/rounds/${roundId}/heats`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) },
      clickStartedAt
    );
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось добавить заход.");
      return;
    }
    router.refresh();
  }

  return (
    <span className="inline-flex flex-col items-start gap-1.5">
      {/* Акцентный, а не серый outline (по прямому запросу пользователя,
          2026-09-09 — "в цветовой гамме"): тот же синий, что у активной
          вкладки захода рядом, кнопка стоит прямо в их строке. */}
      <Button
        type="button"
        size="sm"
        variant="adminOutline"
        className="border-admin-primary/40 text-admin-primaryHover hover:border-admin-primary hover:bg-admin-primary/10 hover:text-admin-primaryHover"
        disabled={loading}
        onClick={onClick}
      >
        + Заход
      </Button>
      {/* Ошибка — своей строкой, не рядом с кнопкой (2026-09-09). */}
      {error && <span className="text-xs text-red-400">{error}</span>}
    </span>
  );
}
