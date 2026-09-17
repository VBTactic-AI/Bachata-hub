"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Select, Textarea, Label } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

const FIELD_CLASS = "border-admin-border bg-admin-card2 text-night-text focus:border-admin-primary focus:ring-admin-primary/20";

export const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  ARTISTS: "Артисты",
  VENUE: "Площадка",
  MARKETING: "Маркетинг",
  EQUIPMENT: "Оборудование",
  OTHER: "Другое",
};

export const EXPENSE_STATUS_LABELS: Record<string, string> = {
  PENDING: "Ожидает оплаты",
  PAID: "Оплачено",
};

export type ExpenseFormValue = {
  id: string;
  title: string;
  category: string;
  amount: number;
  currency: string | null;
  status: string;
  note: string | null;
};

export function ExpenseFormModal({
  festivalId,
  mode,
  initial,
  onClose,
}: {
  festivalId: string;
  mode: "create" | "edit";
  initial?: ExpenseFormValue;
  onClose: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [category, setCategory] = useState(initial?.category ?? "OTHER");
  const [amount, setAmount] = useState(initial?.amount != null ? String(initial.amount) : "");
  const [currency, setCurrency] = useState(initial?.currency ?? "BYN");
  const [status, setStatus] = useState(initial?.status ?? "PENDING");
  const [note, setNote] = useState(initial?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = { title, category, amount: Number(amount), currency: currency || null, status, note: note.trim() || null };
      const url = mode === "create" ? `/api/festivals/${festivalId}/expenses` : `/api/festivals/${festivalId}/expenses/${initial!.id}`;
      const res = await fetch(url, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.message ?? "Не удалось сохранить статью расходов.");
        return;
      }
      onClose();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5" onClick={onClose} role="presentation">
      <div
        className="flex max-h-[90vh] w-full max-w-[480px] flex-col overflow-hidden rounded-app border border-admin-border bg-admin-card shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="expense-form-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-admin-border px-5 py-4">
          <h3 id="expense-form-title" className="m-0 text-[17px] font-extrabold text-night-text">
            {mode === "create" ? "Новая статья расходов" : "Редактировать статью расходов"}
          </h3>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <div className="flex flex-col gap-4">
              {error && <p className="m-0 text-sm text-red-400">{error}</p>}

              <Label className="text-admin-muted">
                Название
                <Input value={title} onChange={(e) => setTitle(e.target.value)} className={FIELD_CLASS} placeholder="Гонорар DJ" required />
              </Label>

              <Label className="text-admin-muted">
                Категория
                <Select value={category} onChange={(e) => setCategory(e.target.value)} className={FIELD_CLASS}>
                  {Object.entries(EXPENSE_CATEGORY_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Label>

              <div className="grid grid-cols-2 gap-3">
                <Label className="text-admin-muted">
                  Сумма
                  <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={FIELD_CLASS} required />
                </Label>
                <Label className="text-admin-muted">
                  Валюта
                  <Input value={currency} onChange={(e) => setCurrency(e.target.value)} className={FIELD_CLASS} placeholder="BYN" />
                </Label>
              </div>

              <Label className="text-admin-muted">
                Статус оплаты
                <Select value={status} onChange={(e) => setStatus(e.target.value)} className={FIELD_CLASS}>
                  {Object.entries(EXPENSE_STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Label>

              <Label className="text-admin-muted">
                Заметка
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} className={FIELD_CLASS} rows={2} />
              </Label>
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-admin-border px-5 py-4">
            <Button type="button" variant="adminOutline" onClick={onClose} disabled={saving}>
              Отмена
            </Button>
            <Button type="submit" variant="admin" disabled={saving || !title.trim() || !amount}>
              {saving ? "Сохранение…" : "Сохранить"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
