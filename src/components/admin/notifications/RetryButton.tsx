"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

// Phase 9 (Control Center) — "Повторить сейчас" на упавшей доставке/job'е.
// Общий компонент, endpoint отличается только URL — сама доставка/обработка
// уже идемпотентна на сервере (см. process-job.ts), повторный клик безопасен.
export function RetryButton({ endpoint }: { endpoint: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function retry() {
    setLoading(true);
    setError(null);
    const res = await fetch(endpoint, { method: "POST" });
    setLoading(false);
    if (!res.ok) {
      setError("Не удалось повторить.");
      return;
    }
    setDone(true);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {error && <span className="text-xs text-red-400">{error}</span>}
      <Button type="button" size="sm" variant="adminOutline" disabled={loading || done} onClick={retry}>
        {loading ? "Отправка…" : done ? "Отправлено" : "Повторить сейчас"}
      </Button>
    </div>
  );
}
