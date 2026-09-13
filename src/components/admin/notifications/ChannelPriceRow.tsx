"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { NotificationChannel } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { CHANNEL_LABELS } from "@/lib/notifications/channel-labels";

// Control Center — редактируемая строка "цена за 1000 доставок" одного
// канала (см. NotificationChannelPrice в schema.prisma — это ОЦЕНКА, не
// реальный биллинг провайдера). IN_APP сюда не попадает вовсе (см. страницу).
export function ChannelPriceRow({
  channel,
  pricePerThousand,
  currency,
  sentCount,
  cost,
}: {
  channel: NotificationChannel;
  pricePerThousand: number;
  currency: string;
  sentCount: number;
  cost: number;
}) {
  const router = useRouter();
  const [value, setValue] = useState(String(pricePerThousand));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    const parsed = Number(value.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) {
      setError("Введите неотрицательное число.");
      setSaved(false);
      return;
    }

    setSaving(true);
    setError(null);
    setSaved(false);

    const res = await fetch("/api/admin/notifications/channel-prices", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel, pricePerThousand: parsed, currency }),
    });

    setSaving(false);
    if (!res.ok) {
      setError("Не удалось сохранить.");
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <tr className="border-t border-admin-border align-top">
      <td className="py-2 pr-3 text-sm font-medium text-night-text">{CHANNEL_LABELS[channel]}</td>
      <td className="py-2 pr-3 text-sm text-admin-muted">{sentCount}</td>
      <td className="py-2 pr-3">
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            step="0.0001"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setSaved(false);
            }}
            className="w-28 border-admin-border bg-admin-card2 text-night-text"
          />
          <span className="whitespace-nowrap text-xs text-admin-disabled">{currency} / 1000</span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {error && <span className="text-xs text-red-400">{error}</span>}
          {saved && !error && <span className="text-xs text-night-success">Сохранено</span>}
          <Button type="button" size="sm" variant="adminOutline" disabled={saving} onClick={save}>
            {saving ? "Сохранение…" : "Сохранить"}
          </Button>
        </div>
      </td>
      <td className="py-2 text-sm font-semibold text-night-text">
        {cost.toFixed(2)} {currency}
      </td>
    </tr>
  );
}
