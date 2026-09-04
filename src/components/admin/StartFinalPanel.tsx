"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

// "Начать финал" (промт пользователя, п.50-51) — отдельное явное действие
// от "Начать жеребьёвку" (StartDrawingForm): фиксирует снимок формата/
// критериев, до этого их ещё можно менять (FinalSettingsPanel). Проверка
// готовности — GET на тот же роут, список проблем целиком, не одна за раз
// (CLAUDE.md §46).
export function StartFinalPanel({ roundId }: { roundId: string }) {
  const router = useRouter();
  const [issues, setIssues] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/rounds/${roundId}/start-final`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setIssues(data.issues ?? []);
      })
      .catch(() => {
        if (!cancelled) setIssues(["Не удалось проверить готовность."]);
      });
    return () => {
      cancelled = true;
    };
  }, [roundId]);

  async function onStart() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/rounds/${roundId}/start-final`, { method: "POST" });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось начать финал.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="rounded-app-sm border border-line p-3 mt-2 stack gap-1.5">
      <p className="m-0 font-semibold">Начать финал (критериальное судейство)</p>
      {issues === null && <p className="hint-text m-0">Проверка готовности…</p>}
      {issues && issues.length > 0 && (
        <ul className="stack gap-0.5 m-0 pl-4">
          {issues.map((i, idx) => (
            <li key={idx} className="error-text text-sm">
              {i}
            </li>
          ))}
        </ul>
      )}
      {issues && issues.length === 0 && <p className="hint-text m-0">Всё готово.</p>}
      <Button type="button" size="sm" disabled={loading || !issues || issues.length > 0} onClick={onStart}>
        Начать финал
      </Button>
      {error && <span className="error-text">{error}</span>}
    </div>
  );
}
