"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label, Input } from "@/components/ui/field";

// Публикация официальных мест ВСЕГО соревнования разом (Этап 10, уточнено
// пользователем 2026-09-04 — не по дивизиону отдельно). Готовность
// проверяется на сервере по каждому дивизиону (GET, список проблем целиком,
// по образцу StartFinalPanel/checkFinalReadiness) — кнопка публикации
// активна только когда проблем нет.
export function CompetitionResultsPanel({ competitionId, publicResults }: { competitionId: string; publicResults: boolean }) {
  const router = useRouter();
  const [issues, setIssues] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unpublishing, setUnpublishing] = useState(false);
  const [reason, setReason] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/competitions/${competitionId}/results/publish`)
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
  }, [competitionId]);

  async function publish() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/competitions/${competitionId}/results/publish`, { method: "POST" });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось опубликовать результаты.");
      return;
    }
    router.refresh();
  }

  async function unpublish(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/competitions/${competitionId}/results/unpublish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось отменить публикацию.");
      return;
    }
    setUnpublishing(false);
    setReason("");
    router.refresh();
  }

  return (
    <div className="rounded-app-sm border border-line p-3 stack gap-2">
      <p className="m-0 font-semibold">Публикация результатов соревнования</p>

      {publicResults ? (
        <>
          <p className="hint-text m-0">Результаты опубликованы и видны публично.</p>
          {!unpublishing ? (
            <Button type="button" size="sm" variant="ghost" onClick={() => setUnpublishing(true)}>
              Отменить публикацию
            </Button>
          ) : (
            <form onSubmit={unpublish} className="stack gap-1.5">
              <Label>
                Причина отмены публикации
                <Input value={reason} onChange={(e) => setReason(e.target.value)} required />
              </Label>
              <div className="flex items-center gap-2">
                <Button type="submit" size="sm" variant="secondary" disabled={loading || !reason.trim()}>
                  Отменить публикацию
                </Button>
                <Button type="button" size="sm" variant="ghost" disabled={loading} onClick={() => setUnpublishing(false)}>
                  отмена
                </Button>
              </div>
            </form>
          )}
        </>
      ) : (
        <>
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
          {issues && issues.length === 0 && <p className="hint-text m-0">Все дивизионы рассчитаны и проверены — можно публиковать.</p>}
          <Button type="button" size="sm" disabled={loading || !issues || issues.length > 0} onClick={publish}>
            Опубликовать результаты
          </Button>
        </>
      )}
      {error && <span className="error-text">{error}</span>}
    </div>
  );
}
