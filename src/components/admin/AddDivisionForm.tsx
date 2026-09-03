"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormRoot, Input, Label, Select } from "@/components/ui/field";

const LEVELS = [
  ["NOVICE", "Новички"],
  ["INTERMEDIATE", "Средний"],
  ["ADVANCED", "Продвинутые"],
  ["OPEN", "Открытый"],
  ["INVITATIONAL", "По приглашениям"],
  ["CUSTOM", "Свой"],
] as const;

export function AddDivisionForm({ competitionId }: { competitionId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [level, setLevel] = useState<string>("OPEN");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch(`/api/competitions/${competitionId}/divisions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, level, rules: {} }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось добавить дивизион.");
      return;
    }
    setName("");
    router.refresh();
  }

  return (
    <FormRoot onSubmit={onSubmit} className="mt-4 max-w-[420px]">
      <Label>
        Название дивизиона
        <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Новички" />
      </Label>
      <Label>
        Уровень
        <Select value={level} onChange={(e) => setLevel(e.target.value)}>
          {LEVELS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
      </Label>
      {error && <p className="error-text">{error}</p>}
      <Button type="submit" size="sm" disabled={loading}>
        Добавить дивизион
      </Button>
    </FormRoot>
  );
}
