"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { perfFetch } from "@/lib/performance-debug/client";

export type FinalTieBreakCandidate = { registrationId: string; bibNumber: string | null; displayName: string };

// RANK_ALL (CLAUDE.md §22) — судьи вслух коллегиально расставили ВСЮ
// tie-группу по местам (промт пользователя, п.19), программа только
// фиксирует итог кнопками ↑/↓ (не голосует и не выбирает сама, CLAUDE.md
// §19-20). Отличается от TieBreakDecisionForm (SELECT_N обычной
// перетанцовки) — там выбирают ровно N прошедших, здесь у всех уже есть
// место в финале, нужно только разрешить порядок внутри группы.
export function FinalTieBreakDecisionForm({
  tieBreakRoundId,
  candidates,
}: {
  tieBreakRoundId: string;
  candidates: FinalTieBreakCandidate[];
}) {
  const router = useRouter();
  const [order, setOrder] = useState<FinalTieBreakCandidate[]>(candidates);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function move(i: number, dir: -1 | 1) {
    setOrder((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  async function onSubmit() {
    const clickStartedAt = performance.now();
    setLoading(true);
    setError(null);
    const res = await perfFetch(
      "admin.tie_break_decide_final",
      `/api/tie-break-rounds/${tieBreakRoundId}/decide-final`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderedRegistrationIds: order.map((c) => c.registrationId) }) },
      clickStartedAt
    );
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось сохранить решение.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="stack gap-2 mt-2 rounded-app-sm border border-night-warning/30 bg-night-warning/[0.09] p-3">
      <p className="m-0 text-[12.5px] leading-relaxed text-[#f8cf8d]">
        <span className="font-bold text-night-warning">⚠ Требуется перетанцовка —</span> общая сумма и все критерии по
        приоритету полностью совпали. Судьи коллегиально определяют порядок (обсуждают вслух); отметьте его кнопками ↑/↓
        ниже — от лучшего к худшему.
      </p>
      <ol className="stack gap-1 m-0 pl-4">
        {order.map((c, i) => (
          <li key={c.registrationId} className="flex items-center gap-2 text-sm text-night-text">
            <span>
              №{c.bibNumber ?? "—"} {c.displayName}
            </span>
            <Button type="button" size="sm" variant="adminOutline" disabled={i === 0} onClick={() => move(i, -1)}>
              ↑
            </Button>
            <Button type="button" size="sm" variant="adminOutline" disabled={i === order.length - 1} onClick={() => move(i, 1)}>
              ↓
            </Button>
          </li>
        ))}
      </ol>
      <Button type="button" size="sm" variant="admin" disabled={loading} onClick={onSubmit}>
        Зафиксировать порядок
      </Button>
      {error && <span className="text-sm text-night-danger">{error}</span>}
    </div>
  );
}
