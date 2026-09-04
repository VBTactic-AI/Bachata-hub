"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormRoot, Label, Select, Input } from "@/components/ui/field";

type Category = { id: string; name: string };
type Stage = { id: string; name: string; defaultAdvanceCount: number };

export function AddDivisionForm({
  competitionId,
  categories,
  stages,
}: {
  competitionId: string;
  categories: Category[];
  stages: Stage[];
}) {
  const router = useRouter();
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [heatCapacity, setHeatCapacity] = useState("10");
  // Сколько пар участвует в каждом этапе (docs/00_DECISIONS.md, A14) —
  // задаётся здесь один раз, до начала соревнования, дальше не меняется:
  // на этом строится расчёт cutoff в Advancement Engine. Пустая строка —
  // этот этап не входит в план ЭТОГО дивизиона (можно пропустить, напр.
  // "Отборочный", если дивизион маленький).
  const [stagePlan, setStagePlan] = useState<Record<string, string>>({});
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
        Нет доступных категорий — либо справочник пуст (добавьте хотя бы одну в «Категории соревнований» в меню),
        либо для всех активных категорий дивизион в этом соревновании уже есть.
      </p>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const stagePlanEntries = stages
      .filter((s) => stagePlan[s.id]?.trim())
      .map((s) => ({ stageId: s.id, participantCount: Number(stagePlan[s.id]) }));
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
        stagePlan: stagePlanEntries,
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
        Вместимость захода (пар одновременно на паркете)
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
      {stages.length > 0 && (
        <div className="stack gap-2">
          <p className="hint-text">
            Сколько пар участвует в каждом раунде — навсегда, задаётся сейчас (можно оставить этап пустым, если он
            дивизиону не нужен).
          </p>
          {stages.map((s) => (
            <Label key={s.id} className="flex-row items-center gap-2">
              <span className="min-w-[140px]">{s.name}</span>
              <Input
                type="number"
                min={1}
                placeholder="—"
                value={stagePlan[s.id] ?? ""}
                onChange={(e) => setStagePlan((prev) => ({ ...prev, [s.id]: e.target.value }))}
              />
            </Label>
          ))}
        </div>
      )}
      {error && <p className="error-text">{error}</p>}
      <Button type="submit" size="sm" disabled={loading}>
        Добавить дивизион
      </Button>
    </FormRoot>
  );
}
