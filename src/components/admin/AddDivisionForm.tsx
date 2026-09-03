"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormRoot, Label, Select } from "@/components/ui/field";

type Category = { id: string; name: string };

export function AddDivisionForm({ competitionId, categories }: { competitionId: string; categories: Category[] }) {
  const router = useRouter();
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (categories.length === 0) {
    return (
      <p className="hint-text">
        Нет доступных категорий — сначала добавьте хотя бы одну в общем справочнике («Категории соревнований» в меню).
      </p>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch(`/api/competitions/${competitionId}/divisions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId, rules: {} }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось добавить дивизион.");
      return;
    }
    router.refresh();
  }

  return (
    <FormRoot onSubmit={onSubmit} className="mt-4 max-w-[420px]">
      <Label>
        Категория
        <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
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
