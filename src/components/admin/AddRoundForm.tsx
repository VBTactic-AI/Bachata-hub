"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormRoot, Label, Input, Select } from "@/components/ui/field";

type Stage = { id: string; name: string; defaultAdvanceCount: number };

export function AddRoundForm({ divisionId, stages }: { divisionId: string; stages: Stage[] }) {
  const router = useRouter();
  const [stageId, setStageId] = useState(stages[0]?.id ?? "");
  const [finalistsCount, setFinalistsCount] = useState(String(stages[0]?.defaultAdvanceCount ?? ""));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (stages.length === 0) {
    return (
      <p className="hint-text">
        Нет доступных этапов отбора — сначала добавьте хотя бы один в общем справочнике («Этапы отбора» в меню).
      </p>
    );
  }

  function onStageChange(id: string) {
    setStageId(id);
    const stage = stages.find((s) => s.id === id);
    if (stage) setFinalistsCount(String(stage.defaultAdvanceCount));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch(`/api/divisions/${divisionId}/rounds`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stageId, finalistsCount: Number(finalistsCount) }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось создать раунд.");
      return;
    }
    router.refresh();
  }

  return (
    <FormRoot onSubmit={onSubmit} className="mt-2 max-w-[420px]">
      <Label>
        Этап
        <Select value={stageId} onChange={(e) => onStageChange(e.target.value)}>
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </Label>
      <Label>
        Сколько проходит дальше
        <Input
          required
          type="number"
          min={1}
          value={finalistsCount}
          onChange={(e) => setFinalistsCount(e.target.value)}
        />
      </Label>
      {error && <p className="error-text">{error}</p>}
      <Button type="submit" size="sm" disabled={loading || !stageId}>
        Добавить раунд
      </Button>
    </FormRoot>
  );
}
