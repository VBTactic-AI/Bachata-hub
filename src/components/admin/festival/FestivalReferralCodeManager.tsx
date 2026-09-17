"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Select, Label } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/admin/StatusBadge";

const FIELD_CLASS = "border-admin-border bg-admin-card2 text-night-text focus:border-admin-primary focus:ring-admin-primary/20";

export type ReferralOwnerOption = { id: string; label: string };

export type ReferralCodeRow = {
  id: string;
  code: string;
  ownerLabel: string;
  discountType: "PERCENT" | "FIXED_AMOUNT" | null;
  discountValue: number | null;
  commissionType: "PERCENT" | "FIXED_AMOUNT";
  commissionValue: number;
  active: boolean;
};

type StatsState = { ticketCount: number; totalDiscountAmount: number; totalCommissionAmount: number } | "loading" | null;

// Реферальные коды артистов/школ — Stage 4 сервисного слоя
// (docs/FESTIVAL_SERVICE_LAYER_PLAN.md), отдельная модель от PromoCode:
// атрибуция продаж конкретному владельцу, скидка покупателю опциональна.
// CRUD-поверхность здесь тоже зеркалит PromoCodeManager.tsx — создание/
// список/переключение active, без произвольного редактирования и без
// удаления (см. комментарий в festival-referral-code-service.ts).
export function FestivalReferralCodeManager({
  festivalId,
  initialCodes,
  teachers,
  schools,
}: {
  festivalId: string;
  initialCodes: ReferralCodeRow[];
  teachers: ReferralOwnerOption[];
  schools: ReferralOwnerOption[];
}) {
  const router = useRouter();
  const [codes, setCodes] = useState(initialCodes);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [ownerType, setOwnerType] = useState<"teacher" | "school">("teacher");
  const [ownerId, setOwnerId] = useState(teachers[0]?.id ?? "");
  const [commissionType, setCommissionType] = useState<"PERCENT" | "FIXED_AMOUNT">("PERCENT");
  const [commissionValue, setCommissionValue] = useState("");
  const [hasDiscount, setHasDiscount] = useState(false);
  const [discountType, setDiscountType] = useState<"PERCENT" | "FIXED_AMOUNT">("PERCENT");
  const [discountValue, setDiscountValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<Record<string, StatsState>>({});

  const ownerOptions = ownerType === "teacher" ? teachers : schools;

  async function create() {
    if (!code.trim() || !commissionValue || !ownerId) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/festivals/${festivalId}/referral-codes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: code.trim(),
        [ownerType === "teacher" ? "ownerTeacherId" : "ownerSchoolId"]: ownerId,
        commissionType,
        commissionValue: Number(commissionValue),
        ...(hasDiscount ? { discountType, discountValue: Number(discountValue) } : {}),
      }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.message || data.error || "Не удалось создать код.");
      return;
    }
    setCode("");
    setCommissionValue("");
    setDiscountValue("");
    setHasDiscount(false);
    setOpen(false);
    router.refresh();
  }

  async function toggleActive(id: string, active: boolean) {
    setLoading(true);
    const res = await fetch(`/api/festivals/${festivalId}/referral-codes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    });
    setLoading(false);
    if (res.ok) {
      setCodes((prev) => prev.map((c) => (c.id === id ? { ...c, active } : c)));
      router.refresh();
    }
  }

  async function loadStats(id: string) {
    setStats((prev) => ({ ...prev, [id]: "loading" }));
    const res = await fetch(`/api/festivals/${festivalId}/referral-codes/${id}/stats`);
    const data = await res.json().catch(() => null);
    setStats((prev) => ({ ...prev, [id]: res.ok ? data.stats : null }));
  }

  return (
    <div className="rounded-app border border-admin-border bg-admin-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="m-0 text-sm font-semibold uppercase tracking-wide text-admin-muted">Реферальные коды</h2>
        <Button type="button" variant="adminOutline" size="sm" onClick={() => setOpen((v) => !v)}>
          {open ? "Отмена" : "+ Код"}
        </Button>
      </div>

      {open && (
        <div className="mt-3 flex flex-col gap-2 rounded-app-sm border border-admin-border p-3">
          <div className="grid grid-cols-2 gap-2">
            <Label className="text-admin-muted">
              Код
              <Input value={code} onChange={(e) => setCode(e.target.value)} className={FIELD_CLASS} placeholder="ANA10" />
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
              <Input type="number" min="0" value={commissionValue} onChange={(e) => setCommissionValue(e.target.value)} className={FIELD_CLASS} />
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

          <Button type="button" variant="admin" size="sm" disabled={loading || ownerOptions.length === 0} onClick={create}>
            Создать
          </Button>
          {ownerOptions.length === 0 && (
            <p className="m-0 text-xs text-admin-muted">
              Нет ни одного {ownerType === "teacher" ? "артиста" : "школы"} для выбора.
            </p>
          )}
        </div>
      )}
      {error && <p className="m-0 mt-2 text-xs text-red-400">{error}</p>}

      {codes.length === 0 ? (
        <p className="m-0 mt-3 text-sm text-admin-muted">Реферальных кодов пока нет.</p>
      ) : (
        <div className="mt-3 flex flex-col gap-1.5">
          {codes.map((c) => {
            const codeStats = stats[c.id];
            return (
              <div key={c.id} className="rounded-app-sm border border-admin-border px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-semibold text-night-text">{c.code}</span>
                  <span className="text-admin-muted">{c.ownerLabel}</span>
                  <span className="text-admin-muted">
                    комиссия {c.commissionType === "PERCENT" ? `${c.commissionValue}%` : `${c.commissionValue} BYN`}
                  </span>
                  {c.discountValue != null && (
                    <span className="text-admin-muted">
                      скидка {c.discountType === "PERCENT" ? `${c.discountValue}%` : `${c.discountValue} BYN`}
                    </span>
                  )}
                  <button type="button" disabled={loading} className="ml-auto" onClick={() => toggleActive(c.id, !c.active)}>
                    <StatusBadge label={c.active ? "Активен" : "Выключен"} variant={c.active ? "success" : "neutral"} />
                  </button>
                </div>
                {codeStats == null ? (
                  <button type="button" className="mt-1 text-xs text-admin-primaryHover hover:underline" onClick={() => loadStats(c.id)}>
                    Показать статистику
                  </button>
                ) : codeStats === "loading" ? (
                  <p className="m-0 mt-1 text-xs text-admin-muted">Загрузка…</p>
                ) : (
                  <p className="m-0 mt-1 text-xs text-admin-muted">
                    {codeStats.ticketCount} билетов · скидок на {codeStats.totalDiscountAmount} BYN · комиссия{" "}
                    {codeStats.totalCommissionAmount} BYN
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
