"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormRoot, Label, Select } from "@/components/ui/field";
import { perfFetch } from "@/lib/performance-debug/client";

export function StartDrawingForm({ roundId }: { roundId: string }) {
  const router = useRouter();
  const [callOrder, setCallOrder] = useState<"RANDOM" | "SEQUENTIAL">("RANDOM");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const clickStartedAt = performance.now();
    setError(null);
    setLoading(true);
    const res = await perfFetch(
      "admin.start_drawing",
      `/api/rounds/${roundId}/start-drawing`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ callOrder }) },
      clickStartedAt
    );
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось начать жеребьёвку.");
      return;
    }
    router.refresh();
  }

  return (
    <FormRoot onSubmit={onSubmit} className="mt-2 max-w-[420px]">
      <Label className="text-night-text">
        Порядок вызова участников на паркет
        <Select
          value={callOrder}
          onChange={(e) => setCallOrder(e.target.value as typeof callOrder)}
          className="border-admin-border bg-admin-card2 text-night-text focus:border-admin-primary focus:ring-admin-primary/20"
        >
          <option value="RANDOM">Случайно</option>
          <option value="SEQUENTIAL">По номерам</option>
        </Select>
      </Label>
      <p className="m-0 text-sm text-admin-muted">
        Один выбор на весь раунд — сразу сформирует списки для всех заходов раунда по очереди.
      </p>
      {error && <p className="m-0 text-sm text-red-400">{error}</p>}
      <Button type="submit" size="sm" variant="admin" disabled={loading}>
        Начать жеребьёвку
      </Button>
    </FormRoot>
  );
}
