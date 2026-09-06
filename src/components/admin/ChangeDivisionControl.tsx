"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";

type DivisionOption = { id: string; categoryName: string };

export function ChangeDivisionControl({
  registrationId,
  currentDivisionId,
  divisions,
}: {
  registrationId: string;
  currentDivisionId: string;
  divisions: DivisionOption[];
}) {
  const router = useRouter();
  const [divisionId, setDivisionId] = useState(currentDivisionId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (divisions.length <= 1) return null; // менять не на что

  async function apply() {
    if (divisionId === currentDivisionId) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/registrations/${registrationId}/division`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ divisionId }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось изменить категорию.");
      return;
    }
    router.refresh();
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Select
        value={divisionId}
        onChange={(e) => setDivisionId(e.target.value)}
        className="!w-auto border-night-border bg-night-card2 py-1.5 text-sm text-night-text focus:border-night-primary focus:ring-night-primary/20"
      >
        {divisions.map((d) => (
          <option key={d.id} value={d.id}>
            {d.categoryName}
          </option>
        ))}
      </Select>
      {divisionId !== currentDivisionId && (
        <Button type="button" size="sm" disabled={loading} onClick={apply} className="border-none bg-gradient-night-cta">
          Сохранить категорию
        </Button>
      )}
      {error && <span className="text-sm text-red-400">{error}</span>}
    </span>
  );
}
