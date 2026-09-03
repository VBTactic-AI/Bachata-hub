"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormRoot, Input, Label } from "@/components/ui/field";

export function CreateRoundStageForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [defaultAdvanceCount, setDefaultAdvanceCount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch("/api/round-stages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, defaultAdvanceCount: Number(defaultAdvanceCount) }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось добавить этап.");
      return;
    }
    setName("");
    setDefaultAdvanceCount("");
    router.refresh();
  }

  return (
    <FormRoot onSubmit={onSubmit} className="max-w-[420px]">
      <Label>
        Название нового этапа
        <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Четвертьфинал" />
      </Label>
      <Label>
        Сколько проходит дальше по умолчанию
        <Input
          required
          type="number"
          min={1}
          value={defaultAdvanceCount}
          onChange={(e) => setDefaultAdvanceCount(e.target.value)}
          placeholder="8"
        />
      </Label>
      {error && <p className="error-text">{error}</p>}
      <Button type="submit" size="sm" disabled={loading}>
        Добавить этап
      </Button>
    </FormRoot>
  );
}
