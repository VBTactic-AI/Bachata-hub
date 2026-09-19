"use client";

import { useState } from "react";
import { Input, Select, Label } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import type { PromoCodeRow } from "./PromoCodeManager";

const FIELD_CLASS = "border-admin-border bg-admin-card2 text-night-text focus:border-admin-primary focus:ring-admin-primary/20";

// Создание/редактирование промокода попапом (перенос UI-прототипа,
// Stage F, 2026-09-20, по прямому запросу пользователя) — тот же модальный
// паттерн, что и у ProgramItemFormModal/SponsorFormModal.
export function PromoCodeFormModal({
  eventSlug,
  mode,
  initial,
  onClose,
  onSaved,
}: {
  eventSlug: string;
  mode: "create" | "edit";
  initial?: PromoCodeRow;
  onClose: () => void;
  onSaved: (code: PromoCodeRow) => void;
}) {
  const [code, setCode] = useState(initial?.code ?? "");
  const [discountType, setDiscountType] = useState<"PERCENT" | "FIXED_AMOUNT">(initial?.discountType ?? "PERCENT");
  const [discountValue, setDiscountValue] = useState(initial ? String(initial.discountValue) : "");
  const [hasMaxUses, setHasMaxUses] = useState(initial?.maxUses != null);
  const [maxUses, setMaxUses] = useState(initial?.maxUses != null ? String(initial.maxUses) : "");
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        code: code.trim(),
        discountType,
        discountValue: Number(discountValue),
        maxUses: hasMaxUses && maxUses ? Number(maxUses) : null,
        isActive,
      };
      const url = mode === "create" ? `/api/events/${eventSlug}/promo-codes` : `/api/events/${eventSlug}/promo-codes/${initial!.id}`;
      const res = await fetch(url, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.message ?? "Не удалось сохранить промокод.");
        return;
      }
      onSaved(data.promoCode);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5" onClick={onClose} role="presentation">
      <div
        className="flex max-h-[90vh] w-full max-w-[460px] flex-col overflow-hidden rounded-app border border-admin-border bg-admin-card shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="promo-form-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-admin-border px-5 py-4">
          <h3 id="promo-form-title" className="m-0 text-[15px] font-extrabold text-night-text">
            {mode === "create" ? "Новый промокод" : "Редактировать промокод"}
          </h3>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <div className="flex flex-col gap-3">
              {error && <p className="m-0 text-sm text-red-400">{error}</p>}

              <Label className="text-admin-muted">
                Код
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  className={FIELD_CLASS}
                  placeholder="BACHATA20"
                  required
                />
              </Label>

              <div className="grid grid-cols-2 gap-3">
                <Label className="text-admin-muted">
                  Тип скидки
                  <Select value={discountType} onChange={(e) => setDiscountType(e.target.value as "PERCENT" | "FIXED_AMOUNT")} className={FIELD_CLASS}>
                    <option value="PERCENT">Процент, %</option>
                    <option value="FIXED_AMOUNT">Фиксированная сумма</option>
                  </Select>
                </Label>
                <Label className="text-admin-muted">
                  Размер скидки
                  <Input type="number" min="0" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} className={FIELD_CLASS} required />
                </Label>
              </div>

              <label className="flex items-center gap-2 text-sm text-night-text">
                <input type="checkbox" checked={hasMaxUses} onChange={(e) => setHasMaxUses(e.target.checked)} />
                Ограничить количество использований
              </label>
              {hasMaxUses && (
                <Input type="number" min={1} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} className={FIELD_CLASS} placeholder="100" />
              )}

              {mode === "edit" && (
                <label className="flex items-center gap-2 text-sm text-night-text">
                  <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                  Активен
                </label>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-admin-border px-5 py-4">
            <Button type="button" variant="adminOutline" onClick={onClose} disabled={saving}>
              Отмена
            </Button>
            <Button type="submit" variant="admin" disabled={saving || !code.trim() || !discountValue}>
              {saving ? "Сохранение…" : mode === "create" ? "Добавить промокод" : "Сохранить"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
