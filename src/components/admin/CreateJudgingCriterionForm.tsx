"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormRoot, Input, Label } from "@/components/ui/field";

export function CreateJudgingCriterionForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [minScore, setMinScore] = useState(1);
  const [maxScore, setMaxScore] = useState(10);
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch("/api/judging-criteria", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, minScore, maxScore, step }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось добавить критерий.");
      return;
    }
    setName("");
    router.refresh();
  }

  const fieldClass = "border-night-border bg-night-card text-night-text focus:border-admin-primary focus:ring-admin-primary/20";

  return (
    <FormRoot onSubmit={onSubmit} className="max-w-[420px]">
      <Label className="text-night-muted">
        Название критерия
        <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Музыкальность" className={fieldClass} />
      </Label>
      <div className="flex flex-wrap items-end gap-2">
        <Label className="text-night-muted">
          От
          <Input type="number" required value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} className={fieldClass} style={{ maxWidth: 90 }} />
        </Label>
        <Label className="text-night-muted">
          До
          <Input type="number" required value={maxScore} onChange={(e) => setMaxScore(Number(e.target.value))} className={fieldClass} style={{ maxWidth: 90 }} />
        </Label>
        <Label className="text-night-muted">
          Шаг
          <Input type="number" min={1} required value={step} onChange={(e) => setStep(Number(e.target.value))} className={fieldClass} style={{ maxWidth: 90 }} />
        </Label>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <Button type="submit" size="sm" disabled={loading || maxScore <= minScore} className="border-none bg-gradient-admin-cta self-start">
        Добавить критерий
      </Button>
    </FormRoot>
  );
}
