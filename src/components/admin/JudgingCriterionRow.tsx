"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

// Строка скрытого критерия справочника — только "вернуть в список" (без
// порядка, как и CategoryRow.tsx: у скрытых позиции в видимом списке нет).
export function JudgingCriterionRow({ criterionId, name, minScore, maxScore }: { criterionId: string; name: string; minScore: number; maxScore: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function unhide() {
    setLoading(true);
    await fetch(`/api/judging-criteria/${criterionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: true }),
    });
    setLoading(false);
    router.refresh();
  }

  return (
    <div className="grid grid-cols-[32px_1fr_auto] items-center gap-3 rounded-app-sm border-l-4 border-transparent px-3 py-2.5 transition-colors hover:border-admin-primary hover:bg-night-card2 sm:grid-cols-[48px_1fr_140px]">
      <span />
      <span className="min-w-0 truncate text-left text-sm font-medium text-night-muted">
        {name} <span className="font-normal">({minScore}–{maxScore})</span>
      </span>
      <span className="flex items-center justify-end">
        <Button type="button" size="sm" variant="ghost" disabled={loading} onClick={unhide} className="text-xs text-night-disabled hover:text-night-muted hover:underline">
          скрыт — вернуть
        </Button>
      </span>
    </div>
  );
}
