"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Textarea, Label } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { DateTimeField } from "@/components/ui/DateTimeField";

const FIELD_CLASS = "border-admin-border bg-admin-card2 text-night-text focus:border-admin-primary focus:ring-admin-primary/20";

export type TicketTypeFormValue = {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  currency: string | null;
  quantity: number | null;
  salesStartAt: string | null;
  salesEndAt: string | null;
};

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 16);
}

// Создание/редактирование TicketType (2026-09-16, Ticket Engine v2) —
// упрощённая версия PassFormModal.tsx: без шаблонов, Early Bird (отдельный
// TicketType — не тир) и грантов доступа (билет на одно событие целиком).
export function TicketTypeFormModal({
  eventSlug,
  mode,
  initial,
  onClose,
}: {
  eventSlug: string;
  mode: "create" | "edit";
  initial?: TicketTypeFormValue;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [isFree, setIsFree] = useState(initial ? initial.price == null : false);
  const [price, setPrice] = useState(initial?.price != null ? String(initial.price) : "");
  const [currency, setCurrency] = useState(initial?.currency ?? "BYN");
  const [unlimited, setUnlimited] = useState(initial ? initial.quantity == null : true);
  const [quantity, setQuantity] = useState(initial?.quantity != null ? String(initial.quantity) : "");
  const [salesStartAt, setSalesStartAt] = useState(toLocalInput(initial?.salesStartAt ?? null));
  const [salesEndAt, setSalesEndAt] = useState(toLocalInput(initial?.salesEndAt ?? null));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) {
      setError("Название обязательно.");
      return;
    }
    setLoading(true);
    setError(null);

    const body = {
      name: name.trim(),
      description: description.trim() || null,
      price: isFree ? null : price ? Number(price) : null,
      currency: isFree ? null : currency || null,
      quantity: unlimited ? null : quantity ? Number(quantity) : null,
      salesStartAt: salesStartAt ? new Date(salesStartAt).toISOString() : null,
      salesEndAt: salesEndAt ? new Date(salesEndAt).toISOString() : null,
    };

    const url = mode === "create" ? `/api/events/${eventSlug}/ticket-types` : `/api/events/${eventSlug}/ticket-types/${initial!.id}`;
    const res = await fetch(url, {
      method: mode === "create" ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.message || data.error || "Не удалось сохранить билет.");
      return;
    }
    onClose();
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5" onClick={onClose} role="presentation">
      <div
        className="flex max-h-[90vh] w-full max-w-[480px] flex-col overflow-hidden rounded-app border border-admin-border bg-admin-card shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ticket-type-form-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-admin-border px-5 py-4">
          <h3 id="ticket-type-form-title" className="m-0 text-[17px] font-extrabold text-night-text">
            {mode === "create" ? "Новый билет" : "Редактировать билет"}
          </h3>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="flex flex-col gap-4">
            <Label className="text-admin-muted">
              Название
              <Input value={name} onChange={(e) => setName(e.target.value)} className={FIELD_CLASS} placeholder="Dancer" />
            </Label>

            <Label className="text-admin-muted">
              Описание
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className={FIELD_CLASS} rows={2} />
            </Label>

            <div className="rounded-app-sm border border-admin-border p-3">
              <label className="flex items-center gap-2 text-sm text-night-text">
                <input type="checkbox" checked={isFree} onChange={(e) => setIsFree(e.target.checked)} className="accent-admin-primary" />
                Бесплатный билет
              </label>
              {!isFree && (
                <div className="mt-2 grid grid-cols-2 gap-2">
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
            </div>

            <div className="rounded-app-sm border border-admin-border p-3">
              <label className="flex items-center gap-2 text-sm text-night-text">
                <input type="checkbox" checked={unlimited} onChange={(e) => setUnlimited(e.target.checked)} className="accent-admin-primary" />
                Без ограничения количества
              </label>
              {!unlimited && (
                <Label className="mt-2 text-admin-muted">
                  Количество мест
                  <Input type="number" min="1" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={FIELD_CLASS} />
                </Label>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Label className="text-admin-muted">
                Начало продаж
                <DateTimeField value={salesStartAt} onChange={setSalesStartAt} className={FIELD_CLASS} />
              </Label>
              <Label className="text-admin-muted">
                Окончание продаж
                <DateTimeField value={salesEndAt} onChange={setSalesEndAt} className={FIELD_CLASS} />
              </Label>
            </div>
          </div>
        </div>

        {error && <p className="m-0 px-5 py-2 text-xs text-red-400">{error}</p>}

        <div className="flex items-center justify-end gap-2 border-t border-admin-border px-5 py-4">
          <Button type="button" size="sm" variant="ghost" className="text-admin-muted hover:text-admin-primaryHover" onClick={onClose}>
            Отмена
          </Button>
          <Button type="button" size="sm" variant="admin" disabled={loading} onClick={submit}>
            {mode === "create" ? "Создать" : "Сохранить"}
          </Button>
        </div>
      </div>
    </div>
  );
}
