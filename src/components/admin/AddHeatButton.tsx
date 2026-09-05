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
    <span className="inline-flex items-center gap-2">
      <Button type="button" size="sm" variant="outline" disabled={loading} onClick={onClick}>
        + Заход
      </Button>
      {error && <span className="error-text">{error}</span>}
    </span>
  );
}
