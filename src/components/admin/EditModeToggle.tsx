"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { RoundStatus } from "@prisma/client";
import { Switch } from "@/components/admin/Switch";

// "Режим редактирования" (промт пользователя, 2026-09-10) — раньше "+ Заход"
// был виден всегда; теперь на его месте этот тумблер, а "+ Заход" и кнопки
// добавления/удаления реального участника показываются, только пока он
// включён (см. CompetitionMonitor.tsx). Состояние — на клиенте, у самого
// раунда нет отдельного поля "режим редактирования": включение — это либо
// просто открытие уже существующих кнопок (раунд уже DRAWING — жеребьёвка
// была автоматической или заполнялась вручную раньше), либо, если раунд ещё
// READY, реальный переход READY -> DRAWING БЕЗ авто-заполнения
// (startRoundManually, draw-manual.ts) — тогда до включения нужен один
// сетевой запрос, поэтому компонент не полностью "глухой" клиентский тумблер.
export function EditModeToggle({
  roundId,
  roundStatus,
  checked,
  onChange,
}: {
  roundId: string;
  roundStatus: RoundStatus;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const next = !checked;
    if (next && roundStatus === "READY") {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/rounds/${roundId}/start-manual`, { method: "POST" });
      setLoading(false);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Не удалось включить режим редактирования.");
        return;
      }
      router.refresh();
    }
    onChange(next);
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Switch checked={checked} onChange={toggle} disabled={loading} label="Режим редактирования" tone="primary" />
      <span className="whitespace-nowrap text-xs font-semibold text-admin-muted">Режим редактирования</span>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </span>
  );
}
