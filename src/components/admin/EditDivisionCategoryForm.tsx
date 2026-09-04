"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

// Порядок задаёт иерархию для авто-добора помощников при жеребьёвке
// (docs/00_DECISIONS.md, A10) — категория с БОЛЬШИМ order считается "выше".
// Раньше поменять порядок после создания было нельзя вообще (2026-09-04).
export function EditDivisionCategoryForm({
  categoryId,
  name: initialName,
  order: initialOrder,
}: {
  categoryId: string;
  name: string;
  order: number;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [order, setOrder] = useState(String(initialOrder));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const changed = name !== initialName || Number(order) !== initialOrder;

  async function save() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/division-categories/${categoryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, order: Number(order) }),
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
        value={order}
        onChange={(e) => setOrder(e.target.value)}
        className="!w-auto py-1.5 text-sm"
        style={{ maxWidth: 80 }}
        title="Порядок — чем больше число, тем 'выше' категория"
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
