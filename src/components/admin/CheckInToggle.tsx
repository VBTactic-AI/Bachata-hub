"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Switch } from "@/components/admin/Switch";
import { perfFetch } from "@/lib/performance-debug/client";

// Check-in теперь тумблер в обе стороны (redesign, 2026-09-09) — раньше
// была одноразовая кнопка "Check-in" без возможности отменить. Выключение
// зовёт cancelCheckIn() (реально удаляет запись CheckIn — bib-номер
// освобождается, история остаётся в AuditLog).
export function CheckInToggle({ registrationId, checkedIn, displayName }: { registrationId: string; checkedIn: boolean; displayName: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onChange() {
    const clickStartedAt = performance.now();
    setLoading(true);
    setError(null);
    const res = checkedIn
      ? await fetch(`/api/registrations/${registrationId}/checkin`, { method: "DELETE" })
      : await perfFetch(
          "admin.checkin",
          `/api/registrations/${registrationId}/checkin`,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) },
          clickStartedAt
        );
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось изменить check-in.");
      return;
    }
    router.refresh();
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <Switch checked={checkedIn} onChange={onChange} disabled={loading} label={`Check-in: ${displayName}`} />
      {error && <span className="text-xs text-red-400">{error}</span>}
    </span>
  );
}
