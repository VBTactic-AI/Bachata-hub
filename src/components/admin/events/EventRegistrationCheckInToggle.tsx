"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/admin/StatusBadge";

// Door check-in (2026-09-16) — тот же принцип клика-переключателя, что и
// EventRegistrationPaymentToggle/CheckInToggle Competition Engine. Отдельный
// эндпоинт (не через общий PATCH status/isPaid) — см.
// registration-service.ts::toggleEventRegistrationCheckIn.
export function EventRegistrationCheckInToggle({
  eventSlug,
  registrationId,
  checkedIn,
}: {
  eventSlug: string;
  registrationId: string;
  checkedIn: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/events/${eventSlug}/registrations/${registrationId}/checkin`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checkedIn: !checkedIn }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.message || data.error || "Не удалось изменить check-in.");
      return;
    }
    router.refresh();
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <button type="button" disabled={loading} onClick={toggle} className="disabled:cursor-not-allowed disabled:opacity-50">
        <StatusBadge label={checkedIn ? "Пришёл" : "Не отмечен"} variant={checkedIn ? "success" : "neutral"} />
      </button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </span>
  );
}
