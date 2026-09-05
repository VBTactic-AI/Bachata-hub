"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { perfFetch } from "@/lib/performance-debug/client";

export function CheckInButton({ registrationId }: { registrationId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    const clickStartedAt = performance.now();
    setLoading(true);
    setError(null);
    const res = await perfFetch(
      "admin.checkin",
      `/api/registrations/${registrationId}/checkin`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) },
      clickStartedAt
    );
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось выполнить check-in.");
      return;
    }
    router.refresh();
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Button type="button" size="sm" variant="secondary" disabled={loading} onClick={onClick}>
        Check-in
      </Button>
      {error && <span className="error-text">{error}</span>}
    </span>
  );
}
