"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

export function EditRoundStageForm({
  stageId,
  name: initialName,
  defaultAdvanceCount: initialCount,
}: {
  stageId: string;
  name: string;
  defaultAdvanceCount: number;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [defaultAdvanceCount, setDefaultAdvanceCount] = useState(String(initialCount));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const changed = name !== initialName || Number(defaultAdvanceCount) !== initialCount;

  async function save() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/round-stages/${stageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, defaultAdvanceCount: Number(defaultAdvanceCount) }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось сохранить изменения.");
      return;
    }
    router.refresh();
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="!w-auto py-1.5 text-sm"
        style={{ maxWidth: 200 }}
      />
      <Input
        type="number"
        min={1}
        value={defaultAdvanceCount}
        onChange={(e) => setDefaultAdvanceCount(e.target.value)}
        className="!w-auto py-1.5 text-sm"
        style={{ maxWidth: 90 }}
      />
      {changed && !!name.trim() && (
        <Button type="button" size="sm" disabled={loading} onClick={save}>
          Сохранить
        </Button>
      )}
      {error && <span className="error-text">{error}</span>}
    </span>
  );
}
