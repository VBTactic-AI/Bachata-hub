"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { perfFetch } from "@/lib/performance-debug/client";

export function RerollDrawButton({ heatId }: { heatId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    const clickStartedAt = performance.now();
    setLoading(true);
    setError(null);
    const res = await perfFetch(
      "admin.reroll_draw",
      `/api/heats/${heatId}/reroll-draw`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) },
      clickStartedAt
    );
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось пересобрать жеребьёвку.");
      return;
    }
    setOpen(false);
    setReason("");
    router.refresh();
  }

  if (!open) {
    return (
      <Button type="button" size="sm" variant="adminOutline" onClick={() => setOpen(true)}>
        Пересобрать
      </Button>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Причина пересборки"
        className="!w-auto border-admin-border bg-admin-card2 py-1.5 text-sm text-night-text placeholder:text-admin-disabled focus:border-admin-primary focus:ring-admin-primary/20"
        style={{ maxWidth: 220 }}
      />
      <Button type="button" size="sm" variant="admin" disabled={loading || !reason.trim()} onClick={submit}>
        Подтвердить
      </Button>
      <Button type="button" size="sm" variant="ghost" className="text-admin-muted hover:text-admin-primaryHover" onClick={() => setOpen(false)}>
        Отмена
      </Button>
      {error && <span className="text-sm text-red-400">{error}</span>}
    </span>
  );
}
