"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormRoot, Label, Input, Select } from "@/components/ui/field";
import { ROUND_TYPE_LABELS } from "@/lib/competition-labels";

// TIE_BREAK/DANCE_OFF не показываем — их создаёт Advancement Engine
// автоматически при ничьей на cutoff (этап 8), не организатор вручную
// (docs/00_DECISIONS.md, createRoundSchema ограничивает то же самое на сервере).
const MANUAL_TYPES = ["PRELIMINARY", "CALLBACK", "QUARTERFINAL", "SEMIFINAL", "FINAL"] as const;

export function AddRoundForm({ divisionId }: { divisionId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState<(typeof MANUAL_TYPES)[number]>("PRELIMINARY");
  const [finalistsCount, setFinalistsCount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch(`/api/divisions/${divisionId}/rounds`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        type,
        finalistsCount: finalistsCount ? Number(finalistsCount) : undefined,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось создать раунд.");
      return;
    }
    setName("");
    setFinalistsCount("");
    router.refresh();
  }

  return (
    <FormRoot onSubmit={onSubmit} className="mt-2 max-w-[420px]">
      <Label>
        Название раунда
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Напр. Первый отборочный" required />
      </Label>
      <Label>
        Тип
        <Select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
          {MANUAL_TYPES.map((t) => (
            <option key={t} value={t}>
              {ROUND_TYPE_LABELS[t]}
            </option>
          ))}
        </Select>
      </Label>
      <Label>
        Сколько проходит дальше (необязательно)
        <Input
          type="number"
          min={1}
          value={finalistsCount}
          onChange={(e) => setFinalistsCount(e.target.value)}
          placeholder="Оставьте пустым, если не финальный отбор"
        />
      </Label>
      {error && <p className="error-text">{error}</p>}
      <Button type="submit" size="sm" disabled={loading || !name.trim()}>
        Добавить раунд
      </Button>
    </FormRoot>
  );
}
