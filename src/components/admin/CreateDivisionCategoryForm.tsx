"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormRoot, Input, Label } from "@/components/ui/field";

export function CreateDivisionCategoryForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch("/api/division-categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось добавить категорию.");
      return;
    }
    setName("");
    router.refresh();
  }

  return (
    <FormRoot onSubmit={onSubmit} className="max-w-[420px]">
      <Label>
        Название новой категории
        <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Юниоры" />
      </Label>
      {error && <p className="error-text">{error}</p>}
      <Button type="submit" size="sm" disabled={loading}>
        Добавить категорию
      </Button>
    </FormRoot>
  );
}
