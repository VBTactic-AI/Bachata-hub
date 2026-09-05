"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { perfFetch } from "@/lib/performance-debug/client";

export type TieBreakCandidate = { registrationId: string; bibNumber: string | null; displayName: string; role: "LEADER" | "FOLLOWER" };

// Два режима (TIEBREAK-001, docs/00_DECISIONS.md): SELECT_N (CLAUDE.md §22,
// по умолчанию) — HEAD_JUDGE/EVENT_ADMIN выбирает ровно expectedCount
// человек, которых судьи в жизни уже обсудили вслух и назвали ведущему;
// FULL_RANK (fullRank=true — ничья ЗА МЕСТО в финале без критериальной
// системы, никого не отсеивают) — нужно расставить ВСЮ группу по порядку
// (как FinalTieBreakDecisionForm для критериального финала). Программа в
// обоих случаях только фиксирует итог и не выбирает сама (CLAUDE.md §19-20).
export function TieBreakDecisionForm({
  tieBreakRoundId,
  expectedCount,
  candidates,
  fullRank,
}: {
  tieBreakRoundId: string;
  expectedCount: number;
  candidates: TieBreakCandidate[];
  fullRank?: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [order, setOrder] = useState<TieBreakCandidate[]>(candidates);
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

  function move(i: number, dir: -1 | 1) {
    setOrder((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  async function submit(registrationIds: string[]) {
    const clickStartedAt = performance.now();
    setLoading(true);
    setError(null);
    const res = await perfFetch(
      "admin.tie_break_decide",
      `/api/tie-break-rounds/${tieBreakRoundId}/decide`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ advancingRegistrationIds: registrationIds }) },
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

  if (fullRank) {
    return (
      <div className="stack gap-2 mt-2">
        <p className="hint-text m-0">
          ⚠ Ничья за место — никого не отсеиваем, нужно решить порядок мест внутри группы. Судьи коллегиально определяют
          порядок (обсуждают вслух); отметьте его кнопками ↑/↓ ниже — от лучшего к худшему.
        </p>
        <ol className="stack gap-1 m-0 pl-4">
          {order.map((c, i) => (
            <li key={c.registrationId} className="flex items-center gap-2">
              <span>
                {c.role === "LEADER" ? "Ведущий" : "Ведомый"} {c.displayName} №{c.bibNumber ?? "—"}
              </span>
              <Button type="button" size="sm" variant="outline" disabled={i === 0} onClick={() => move(i, -1)}>
                ↑
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={i === order.length - 1} onClick={() => move(i, 1)}>
                ↓
              </Button>
            </li>
          ))}
        </ol>
        <Button type="button" size="sm" variant="secondary" disabled={loading} onClick={() => submit(order.map((c) => c.registrationId))}>
          Зафиксировать порядок
        </Button>
        {error && <span className="error-text">{error}</span>}
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit([...selected]);
      }}
      className="stack gap-2 mt-2"
    >
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
