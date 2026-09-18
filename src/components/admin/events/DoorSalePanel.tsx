"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select, Label, Input } from "@/components/ui/field";

export type SellableProduct = { productId: string; kind: "pass" | "tickettype"; name: string; price: number | null; currency: string | null };

function formatMoney(price: number | null, currency: string | null): string {
  return price == null ? "Бесплатно" : `${price} ${currency ?? ""}`.trim();
}

// "Продажа на входе" (2026-09-18, по прямому запросу пользователя) —
// анонимная продажа Pass/TicketType человеку без аккаунта на сайте
// (иностранец, случайный гость), когда организатору важен только оборот, а
// не то, кто это был (см. комментарий у модели DoorSale в schema.prisma).
// Доступна для ЛЮБОГО события с хотя бы одним активным товаром — отдельного
// переключателя "включить" нет, пользоваться или нет решает сам
// организатор в моменте.
export function DoorSalePanel({ eventSlug, products }: { eventSlug: string; products: SellableProduct[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState(products[0] ? `${products[0].kind}:${products[0].productId}` : "");
  const [method, setMethod] = useState<"CASH" | "TRANSFER">("CASH");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (products.length === 0) return null;

  const selected = products.find((p) => `${p.kind}:${p.productId}` === selectedKey) ?? products[0];

  async function submit() {
    if (!selected) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/events/${eventSlug}/door-sales`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: selected.kind, productId: selected.productId, method, note: note.trim() || undefined }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.message || data.error || "Не удалось добавить продажу.");
      return;
    }
    setNote("");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <Button type="button" size="sm" variant="adminOutline" onClick={() => setOpen(true)}>
        Продажа на входе
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-app border border-admin-border bg-admin-card/50 p-3">
      <div className="flex flex-wrap items-end gap-2">
        {products.length === 1 ? (
          <span className="text-sm font-semibold text-night-text">
            {products[0].name} — {formatMoney(products[0].price, products[0].currency)}
          </span>
        ) : (
          <Label className="text-admin-muted">
            Что продали
            <Select
              value={selectedKey}
              onChange={(e) => setSelectedKey(e.target.value)}
              disabled={loading}
              className="min-w-[200px] border-admin-border bg-admin-card2 py-1.5 text-sm text-night-text focus:border-admin-primary focus:ring-admin-primary/20"
            >
              {products.map((p) => (
                <option key={`${p.kind}:${p.productId}`} value={`${p.kind}:${p.productId}`}>
                  {p.name} — {formatMoney(p.price, p.currency)}
                </option>
              ))}
            </Select>
          </Label>
        )}
        <Label className="text-admin-muted">
          Способ оплаты
          <Select
            value={method}
            onChange={(e) => setMethod(e.target.value as "CASH" | "TRANSFER")}
            disabled={loading}
            className="border-admin-border bg-admin-card2 py-1.5 text-sm text-night-text focus:border-admin-primary focus:ring-admin-primary/20"
          >
            <option value="CASH">Наличные</option>
            <option value="TRANSFER">Б/н (перевод)</option>
          </Select>
        </Label>
        <Label className="text-admin-muted">
          Заметка (необязательно)
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={loading}
            placeholder="иностранец, гость DJ…"
            className="min-w-[160px] border-admin-border bg-admin-card2 py-1.5 text-sm text-night-text focus:border-admin-primary focus:ring-admin-primary/20"
          />
        </Label>
        <Button type="button" size="sm" variant="admin" disabled={loading || !selected} onClick={submit}>
          Добавить
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={loading}
          onClick={() => setOpen(false)}
          className="text-admin-muted hover:text-admin-primaryHover"
        >
          Отмена
        </Button>
      </div>
      {error && <p className="m-0 text-sm text-red-400">{error}</p>}
    </div>
  );
}
