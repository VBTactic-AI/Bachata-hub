"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormRoot, Label, Select, Input } from "@/components/ui/field";

type Category = { id: string; name: string };

export function AddDivisionForm({ competitionId, categories }: { competitionId: string; categories: Category[] }) {
  const router = useRouter();
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [heatCapacity, setHeatCapacity] = useState("10");
  // Ротация партнёров (Этап 6, docs/00_DECISIONS.md, A12) — настройки по
  // умолчанию для раундов этого дивизиона, можно переопределить позже на
  // уровне конкретного раунда.
  const [rotationMode, setRotationMode] = useState<"TRACK_AUTO_SHIFT" | "SEGMENT_MANUAL_SHIFT">("TRACK_AUTO_SHIFT");
  const [rotationIntervalSec, setRotationIntervalSec] = useState("30");
  const [rotationShiftMin, setRotationShiftMin] = useState("1");
  const [rotationShiftMax, setRotationShiftMax] = useState("3");
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
      body: JSON.stringify({
        categoryId,
        heatCapacity: Number(heatCapacity),
        rotationMode,
        rotationIntervalSec: Number(rotationIntervalSec),
        rotationShiftMin: Number(rotationShiftMin),
        rotationShiftMax: Number(rotationShiftMax),
        rules: {},
      }),
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
      <Label>
        Вместимость заезда (пар одновременно на паркете)
        <Input type="number" min={1} value={heatCapacity} onChange={(e) => setHeatCapacity(e.target.value)} />
      </Label>
      <Label>
        Ротация партнёров по умолчанию
        <Select value={rotationMode} onChange={(e) => setRotationMode(e.target.value as typeof rotationMode)}>
          <option value="TRACK_AUTO_SHIFT">Смены внутри трека (автоматически, каждые N сек)</option>
          <option value="SEGMENT_MANUAL_SHIFT">Смена между отрезками (диджей вручную, число партнёров)</option>
        </Select>
      </Label>
      {rotationMode === "TRACK_AUTO_SHIFT" ? (
        <Label>
          Интервал смены внутри трека (сек)
          <Input
            type="number"
            min={1}
            value={rotationIntervalSec}
            onChange={(e) => setRotationIntervalSec(e.target.value)}
          />
        </Label>
      ) : (
        <div className="flex gap-3">
          <Label className="flex-1">
            Мин. число партнёров
            <Input type="number" min={1} value={rotationShiftMin} onChange={(e) => setRotationShiftMin(e.target.value)} />
          </Label>
          <Label className="flex-1">
            Макс. число партнёров
            <Input type="number" min={1} value={rotationShiftMax} onChange={(e) => setRotationShiftMax(e.target.value)} />
          </Label>
        </div>
      )}
      {error && <p className="error-text">{error}</p>}
      <Button type="submit" size="sm" disabled={loading}>
        Добавить дивизион
      </Button>
    </FormRoot>
  );
}
