"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Select, Label, FormRoot } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

const FIELD_CLASS = "border-admin-border bg-admin-card2 text-night-text focus:border-admin-primary focus:ring-admin-primary/20";

const PASS_TYPE_LABELS: Record<string, string> = {
  FULL_PASS: "Full Pass",
  PARTY_PASS: "Party Pass",
  WORKSHOP_PASS: "Workshop Pass",
  DAY_PASS: "Day Pass",
  COMPETITION_PASS: "Competition Pass",
  VIP_PASS: "VIP Pass",
  FREE_PASS: "Free Pass",
  CUSTOM: "Другое",
};

// Первый Pass фестиваля — ЕДИНСТВЕННАЯ точка, которая идёт через
// POST /api/festivals/[id]/passes (createFestivalPass), а не через обычный
// /api/events/[slug]/passes: до этого момента у фестиваля нет bridge-Event,
// организатор ничего не выбирает "на каком событии продавать" —
// docs/FESTIVAL_SERVICE_LAYER_PLAN.md, Stage 1. Форма сознательно короче
// полной PassFormModal (без Early Bird/доступа к программе/обложки) — это
// быстрый старт, тонкая настройка доступна сразу после через уже готовый
// PassManager, который подключается, как только bridge появится.
export function FestivalFirstPassForm({ festivalId }: { festivalId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState("FULL_PASS");
  const [isFree, setIsFree] = useState(false);
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("BYN");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/festivals/${festivalId}/passes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          type,
          price: isFree ? null : price ? Number(price) : null,
          currency: isFree ? null : currency || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.message ?? "Не удалось создать Pass.");
        return;
      }
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-app border border-admin-border bg-admin-card p-5">
      <h2 className="m-0 mb-1 text-sm font-semibold uppercase tracking-wide text-admin-muted">Первый Pass</h2>
      <p className="m-0 mb-3 text-sm text-admin-muted">
        У фестиваля ещё нет ни одного Pass — без него нельзя опубликовать фестиваль и не появится страница продаж. После создания
        здесь же откроется полное управление Pass (цены, лимиты, доступ к программе, промокоды, реферальные коды).
      </p>

      <FormRoot onSubmit={handleSubmit} className="max-w-[420px]">
        {error && <p className="m-0 text-sm text-red-400">{error}</p>}

        <Label className="text-admin-muted">
          Название
          <Input value={name} onChange={(e) => setName(e.target.value)} className={FIELD_CLASS} placeholder="Full Pass" required />
        </Label>

        <Label className="text-admin-muted">
          Тип
          <Select value={type} onChange={(e) => setType(e.target.value)} className={FIELD_CLASS}>
            {Object.entries(PASS_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Label>

        <label className="flex items-center gap-2 text-sm text-night-text">
          <input type="checkbox" checked={isFree} onChange={(e) => setIsFree(e.target.checked)} />
          Бесплатный Pass
        </label>

        {!isFree && (
          <div className="grid grid-cols-2 gap-3">
            <Label className="text-admin-muted">
              Цена
              <Input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className={FIELD_CLASS} />
            </Label>
            <Label className="text-admin-muted">
              Валюта
              <Input value={currency} onChange={(e) => setCurrency(e.target.value)} className={FIELD_CLASS} placeholder="BYN" />
            </Label>
          </div>
        )}

        <Button type="submit" variant="admin" disabled={saving || !name.trim()}>
          {saving ? "Создание…" : "Создать первый Pass"}
        </Button>
      </FormRoot>
    </div>
  );
}
