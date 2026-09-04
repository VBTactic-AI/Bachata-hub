"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function RemoveJudgeButton({ assignmentId }: { assignmentId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/judge-assignments/${assignmentId}`, { method: "DELETE" });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось убрать судью.");
      return;
    }
    router.refresh();
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Button type="button" size="sm" variant="ghost" disabled={loading} onClick={onClick}>
        убрать
      </Button>
      {error && <span className="error-text">{error}</span>}
    </span>
  );
}
