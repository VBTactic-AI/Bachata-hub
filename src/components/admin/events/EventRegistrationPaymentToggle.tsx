"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/admin/StatusBadge";

// Тот же принцип клика-переключателя, что и PaymentToggle Competition Engine
// (src/components/admin/PaymentToggle.tsx) — только факт оплачено/не
// оплачено, без сумм (см. комментарий у EventRegistration в schema.prisma).
export function EventRegistrationPaymentToggle({
  eventSlug,
  registrationId,
  isPaid,
}: {
  eventSlug: string;
  registrationId: string;
  isPaid: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/events/${eventSlug}/registrations/${registrationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPaid: !isPaid }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось изменить статус оплаты.");
      return;
    }
    router.refresh();
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <button type="button" disabled={loading} onClick={toggle} className="disabled:cursor-not-allowed disabled:opacity-50">
        <StatusBadge label={isPaid ? "Оплачено" : "Не оплачено"} variant={isPaid ? "success" : "danger"} />
      </button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </span>
  );
}
