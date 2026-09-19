"use client";

import { useState } from "react";
import { Input, Select, Label } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import type { ReferralCodeRow, ReferralOwnerOption } from "./FestivalReferralCodeManager";

const FIELD_CLASS = "border-admin-border bg-admin-card2 text-night-text focus:border-admin-primary focus:ring-admin-primary/20";

// Создание/редактирование реферального кода попапом (перенос UI-прототипа,
// Stage F, 2026-09-20, по прямому запросу пользователя — отменяет более
// раннее решение "без произвольного редактирования") — тот же модальный
// паттерн, что и у остальных менеджеров фестиваля.
export function ReferralCodeFormModal({
  festivalId,
  mode,
  initial,
  teachers,
  schools,
  onClose,
  onSaved,
}: {
  festivalId: string;
  mode: "create" | "edit";
  initial?: ReferralCodeRow & { ownerTeacherId?: string | null; ownerSchoolId?: string | null };
  teachers: ReferralOwnerOption[];
  schools: ReferralOwnerOption[];
  onClose: () => void;
  onSaved: (code: ReferralCodeRow) => void;
}) {
  const [code, setCode] = useState(initial?.code ?? "");
  const [ownerType, setOwnerType] = useState<"teacher" | "school">(initial?.ownerSchoolId ? "school" : "teacher");
  const [ownerId, setOwnerId] = useState(initial?.ownerTeacherId ?? initial?.ownerSchoolId ?? teachers[0]?.id ?? "");
  const [commissionType, setCommissionType] = useState<"PERCENT" | "FIXED_AMOUNT">(initial?.commissionType ?? "PERCENT");
  const [commissionValue, setCommissionValue] = useState(initial ? String(initial.commissionValue) : "");
  const [hasDiscount, setHasDiscount] = useState(initial?.discountValue != null);
  const [discountType, setDiscountType] = useState<"PERCENT" | "FIXED_AMOUNT">(initial?.discountType ?? "PERCENT");
  const [discountValue, setDiscountValue] = useState(initial?.discountValue != null ? String(initial.discountValue) : "");
  const [active, setActive] = useState(initial?.active ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ownerOptions = ownerType === "teacher" ? teachers : schools;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || !commissionValue || !ownerId) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        code: code.trim(),
        [ownerType === "teacher" ? "ownerTeacherId" : "ownerSchoolId"]: ownerId,
        commissionType,
        commissionValue: Number(commissionValue),
        discountType: hasDiscount ? discountType : null,
        discountValue: hasDiscount ? Number(discountValue) : null,
        ...(mode === "edit" ? { active } : {}),
      };
      const url = mode === "create" ? `/api/festivals/${festivalId}/referral-codes` : `/api/festivals/${festivalId}/referral-codes/${initial!.id}`;
      const res = await fetch(url, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.message ?? "Не удалось сохранить код.");
        return;
      }
      const saved = data.code;
      onSaved({
        id: saved.id,
        code: saved.code,
        ownerLabel: ownerOptions.find((o) => o.id === ownerId)?.label ?? "—",
        discountType: saved.discountType,
        discountValue: saved.discountValue == null ? null : Number(saved.discountValue),
        commissionType: saved.commissionType,
        commissionValue: Number(saved.commissionValue),
        active: saved.active,
      });
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
        aria-labelledby="referral-form-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-admin-border px-5 py-4">
          <h3 id="referral-form-title" className="m-0 text-[15px] font-extrabold text-night-text">
            {mode === "create" ? "Новый реферальный код" : "Редактировать реферальный код"}
          </h3>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <div className="flex flex-col gap-3">
              {error && <p className="m-0 text-sm text-red-400">{error}</p>}

              <div className="grid grid-cols-2 gap-2">
                <Label className="text-admin-muted">
                  Код
                  <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className={FIELD_CLASS} placeholder="ANA10" required />
                </Label>
                <Label className="text-admin-muted">
                  Владелец
                  <Select
                    value={ownerType}
                    onChange={(e) => {
                      const next = e.target.value as "teacher" | "school";
                      setOwnerType(next);
                      setOwnerId((next === "teacher" ? teachers : schools)[0]?.id ?? "");
                    }}
                    className={FIELD_CLASS}
                  >
                    <option value="teacher">Артист</option>
                    <option value="school">Школа</option>
                  </Select>
                </Label>
              </div>

              <Label className="text-admin-muted">
                {ownerType === "teacher" ? "Артист" : "Школа"}
                <Select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className={FIELD_CLASS}>
                  {ownerOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Label>

              <div className="grid grid-cols-2 gap-2">
                <Label className="text-admin-muted">
                  Комиссия — тип
                  <Select value={commissionType} onChange={(e) => setCommissionType(e.target.value as "PERCENT" | "FIXED_AMOUNT")} className={FIELD_CLASS}>
                    <option value="PERCENT">%</option>
                    <option value="FIXED_AMOUNT">Сумма</option>
                  </Select>
                </Label>
                <Label className="text-admin-muted">
                  Комиссия — размер
                  <Input type="number" min="0" value={commissionValue} onChange={(e) => setCommissionValue(e.target.value)} className={FIELD_CLASS} required />
                </Label>
              </div>

              <label className="flex items-center gap-2 text-sm text-night-text">
                <input type="checkbox" checked={hasDiscount} onChange={(e) => setHasDiscount(e.target.checked)} />
                Даёт скидку покупателю
              </label>
              {hasDiscount && (
                <div className="grid grid-cols-2 gap-2">
                  <Label className="text-admin-muted">
                    Скидка — тип
                    <Select value={discountType} onChange={(e) => setDiscountType(e.target.value as "PERCENT" | "FIXED_AMOUNT")} className={FIELD_CLASS}>
                      <option value="PERCENT">%</option>
                      <option value="FIXED_AMOUNT">Сумма</option>
                    </Select>
                  </Label>
                  <Label className="text-admin-muted">
                    Скидка — размер
                    <Input type="number" min="0" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} className={FIELD_CLASS} />
                  </Label>
                </div>
              )}

              {mode === "edit" && (
                <label className="flex items-center gap-2 text-sm text-night-text">
                  <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
                  Активен
                </label>
              )}

              {ownerOptions.length === 0 && (
                <p className="m-0 text-xs text-admin-muted">Нет ни одного {ownerType === "teacher" ? "артиста" : "школы"} для выбора.</p>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-admin-border px-5 py-4">
            <Button type="button" variant="adminOutline" onClick={onClose} disabled={saving}>
              Отмена
            </Button>
            <Button type="submit" variant="admin" disabled={saving || ownerOptions.length === 0}>
              {saving ? "Сохранение…" : mode === "create" ? "Добавить реферальный код" : "Сохранить"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
