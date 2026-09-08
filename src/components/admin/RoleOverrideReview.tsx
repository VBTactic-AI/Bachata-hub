"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function RoleOverrideReview({ registrationId }: { registrationId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "APPROVE" | "REJECT") {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/registrations/${registrationId}/role-override`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось сохранить решение.");
      return;
    }
    router.refresh();
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button type="button" size="sm" disabled={loading} onClick={() => decide("APPROVE")} className="border-none bg-gradient-admin-cta">
        Подтвердить роль
      </Button>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={loading}
        onClick={() => decide("REJECT")}
        className="border-admin-border bg-transparent text-night-text hover:bg-admin-card2"
      >
        Отклонить (оставить по полу)
      </Button>
      {error && <span className="text-sm text-red-400">{error}</span>}
    </span>
  );
}
