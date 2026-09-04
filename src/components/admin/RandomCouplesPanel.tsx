"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

export type RandomCouplePairInfo = {
  pairNumber: number;
  leaderName: string;
  leaderBib: string | null;
  followerName: string;
  followerBib: string | null;
  trackName: string | null;
};

// RANDOM_COUPLES (промт пользователя, п.25-27/48) — случайная жеребьёвка
// пары выполняется сервером по клику "Следующая пара" (final-random-couples.ts):
// завершает предыдущую пару, если ещё не завершена, и сразу формирует
// следующую — или завершает финал целиком, если участников для новой пары
// не осталось. Название трека — свободный текст (как HeatRotation.trackName),
// вводится ДО клика, относится к следующей паре.
export function RandomCouplesPanel({ roundId, pairs }: { roundId: string; pairs: RandomCouplePairInfo[] }) {
  const router = useRouter();
  const [trackName, setTrackName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onAdvance() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/rounds/${roundId}/random-couples-advance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackName: trackName.trim() || undefined }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось перейти дальше.");
      return;
    }
    setTrackName("");
    router.refresh();
  }

  return (
    <div className="rounded-app-sm border border-line p-3 mt-2 stack gap-1.5">
      <p className="m-0 font-semibold">Финал «Случайные пары»</p>
      {pairs.length > 0 && (
        <ol className="stack gap-0.5 m-0 pl-4">
          {pairs.map((p) => (
            <li key={p.pairNumber}>
              Пара {p.pairNumber}: №{p.leaderBib ?? "—"} {p.leaderName} + №{p.followerBib ?? "—"} {p.followerName}
              {p.trackName ? ` · ${p.trackName}` : ""}
            </li>
          ))}
        </ol>
      )}
      <label className="stack gap-1 max-w-[300px]">
        <span className="hint-text">Песня для следующей пары (необязательно)</span>
        <Input value={trackName} onChange={(e) => setTrackName(e.target.value)} placeholder="Название трека" />
      </label>
      <Button type="button" size="sm" disabled={loading} onClick={onAdvance}>
        Следующая пара
      </Button>
      {error && <span className="error-text">{error}</span>}
    </div>
  );
}
