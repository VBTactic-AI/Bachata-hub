"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export type TieBreakCandidate = { registrationId: string; bibNumber: string | null; displayName: string; role: "LEADER" | "FOLLOWER" };

// SELECT_N (CLAUDE.md §22) — HEAD_JUDGE/EVENT_ADMIN выбирает ровно N
// человек, которых судьи в жизни уже обсудили вслух и назвали ведущему;
// программа только фиксирует итог и не выбирает сама (CLAUDE.md §19-20).
export function TieBreakDecisionForm({
  tieBreakRoundId,
  expectedCount,
  candidates,
}: {
  tieBreakRoundId: string;
  expectedCount: number;
  candidates: TieBreakCandidate[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/tie-break-rounds/${tieBreakRoundId}/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ advancingRegistrationIds: [...selected] }),
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
    <form onSubmit={onSubmit} className="stack gap-2 mt-2">
      <p className="hint-text">
        Перетанцовка: выберите ровно {expectedCount} прошедших дальше (выбрано {selected.size}).
      </p>
      <ul className="stack gap-1">
        {candidates.map((c) => (
          <li key={c.registrationId}>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={selected.has(c.registrationId)} onChange={() => toggle(c.registrationId)} />
              {c.role === "LEADER" ? "Ведущий" : "Ведомый"} {c.displayName} №{c.bibNumber ?? "—"}
            </label>
          </li>
        ))}
      </ul>
      <Button type="submit" size="sm" variant="secondary" disabled={loading || selected.size !== expectedCount}>
        Зафиксировать решение
      </Button>
      {error && <span className="error-text">{error}</span>}
    </form>
  );
}
