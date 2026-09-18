"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Select, Label } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/admin/StatusBadge";

const FIELD_CLASS = "border-admin-border bg-admin-card2 text-night-text focus:border-admin-primary focus:ring-admin-primary/20";

export type PromoCodeRow = {
  id: string;
  code: string;
  discountType: "PERCENT" | "FIXED_AMOUNT";
  discountValue: number;
  usedCount: number;
  maxUses: number | null;
  isActive: boolean;
};

// Промокоды события — только конфигурация (см. комментарий у PromoCode в
// schema.prisma): расчёт скидки при выдаче билета ещё не реализован, здесь
// только создание/список/активация-деактивация.
export function PromoCodeManager({ eventSlug, initialCodes }: { eventSlug: string; initialCodes: PromoCodeRow[] }) {
  const router = useRouter();
  const [codes, setCodes] = useState(initialCodes);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState<"PERCENT" | "FIXED_AMOUNT">("PERCENT");
  const [discountValue, setDiscountValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (!code.trim() || !discountValue) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/events/${eventSlug}/promo-codes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code.trim(), discountType, discountValue: Number(discountValue) }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.message || data.error || "Не удалось создать код.");
      return;
    }
    setCodes((prev) => [data.promoCode, ...prev]);
    setCode("");
    setDiscountValue("");
    setOpen(false);
    router.refresh();
  }

  async function toggleActive(id: string, isActive: boolean) {
    setLoading(true);
    const res = await fetch(`/api/events/${eventSlug}/promo-codes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive }),
    });
    setLoading(false);
    if (res.ok) {
      setCodes((prev) => prev.map((c) => (c.id === id ? { ...c, isActive } : c)));
      router.refresh();
    }
  }

  return (
    <div className="rounded-app border border-admin-border bg-admin-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="m-0 text-sm font-semibold uppercase tracking-wide text-admin-muted">Промокоды</h2>
        <Button type="button" variant="adminOutline" size="sm" onClick={() => setOpen((v) => !v)}>
          {open ? "Отмена" : "Код"}
        </Button>
      </div>

      {open && (
        <div className="mt-3 flex flex-wrap items-end gap-2 rounded-app-sm border border-admin-border p-3">
          <Label className="text-admin-muted">
            Код
            <Input value={code} onChange={(e) => setCode(e.target.value)} className={FIELD_CLASS} placeholder="BACHATA20" style={{ maxWidth: 160 }} />
          </Label>
          <Label className="text-admin-muted">
            Тип
            <Select value={discountType} onChange={(e) => setDiscountType(e.target.value as "PERCENT" | "FIXED_AMOUNT")} className={FIELD_CLASS}>
              <option value="PERCENT">%</option>
              <option value="FIXED_AMOUNT">Сумма</option>
            </Select>
          </Label>
          <Label className="text-admin-muted">
            Размер
            <Input
              type="number"
              min="0"
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
              className={FIELD_CLASS}
              style={{ maxWidth: 100 }}
            />
          </Label>
          <Button type="button" variant="admin" size="sm" disabled={loading} onClick={create}>
            Создать
          </Button>
        </div>
      )}
      {error && <p className="m-0 mt-2 text-xs text-red-400">{error}</p>}

      {codes.length === 0 ? (
        <p className="m-0 mt-3 text-sm text-admin-muted">Промокодов пока нет.</p>
      ) : (
        <div className="mt-3 flex flex-col gap-1.5">
          {codes.map((c) => (
            <div key={c.id} className="flex items-center gap-2 rounded-app-sm border border-admin-border px-3 py-2 text-sm">
              <span className="font-mono font-semibold text-night-text">{c.code}</span>
              <span className="text-admin-muted">{c.discountType === "PERCENT" ? `-${c.discountValue}%` : `-${c.discountValue} BYN`}</span>
              <span className="text-admin-muted">
                {c.usedCount}
                {c.maxUses != null ? ` / ${c.maxUses}` : ""} использований
              </span>
              <button type="button" disabled={loading} className="ml-auto" onClick={() => toggleActive(c.id, !c.isActive)}>
                <StatusBadge label={c.isActive ? "Активен" : "Выключен"} variant={c.isActive ? "success" : "neutral"} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
