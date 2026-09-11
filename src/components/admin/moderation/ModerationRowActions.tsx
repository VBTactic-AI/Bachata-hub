"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { t } from "@/lib/i18n/dictionary";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

// Admin-тёмная версия старого src/components/ModerationActions.tsx (жил на
// светлой /moderation) — та же логика (approve/reject с необязательной
// причиной, тот же эндпоинт), только вёрстка под admin-* (2026-09-11).
export function ModerationRowActions({ endpoint }: { endpoint: string }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "approve" | "reject") {
    setLoading(true);
    setError(null);
    const res = await fetch(endpoint, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, reason: reason || undefined }),
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
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Input
        placeholder={t.moderation.reasonPlaceholder}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="!w-auto max-w-[160px] border-admin-border bg-admin-card2 py-1.5 text-sm text-night-text placeholder:text-admin-disabled focus:border-admin-primary focus:ring-admin-primary/20"
      />
      <Button type="button" size="sm" disabled={loading} onClick={() => act("approve")} className="border-none bg-gradient-admin-cta">
        {t.moderation.approve}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={loading}
        onClick={() => act("reject")}
        className="border-admin-border bg-transparent text-night-text hover:bg-admin-card2"
      >
        {t.moderation.reject}
      </Button>
      {error && <span className="w-full text-right text-xs text-red-400">{error}</span>}
    </div>
  );
}
