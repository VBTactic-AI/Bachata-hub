"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label, Input } from "@/components/ui/field";
import { perfFetch } from "@/lib/performance-debug/client";

// Тот же приём переопределения полей, что и в DivisionResultsPanel.tsx,
// рядом с которым эта панель теперь и живёт (в Мониторе, а не на "Главной",
// по запросу пользователя 2026-09-09 — "сделаем в мониторе, там же, где
// смотрим результаты по категории").
const FIELD_CLASS = "border-admin-border bg-admin-card2 text-night-text focus:border-admin-primary focus:ring-admin-primary/20";

// Публикация официальных мест ВСЕГО соревнования разом (Этап 10, уточнено
// пользователем 2026-09-04 — не по дивизиону отдельно, даже если кнопка
// открытия теперь показывается рядом с протоколом ОДНОЙ категории в
// Мониторе). Готовность проверяется на сервере по каждому дивизиону (GET,
// список проблем целиком, по образцу StartFinalPanel/checkFinalReadiness) —
// кнопка публикации активна только когда проблем нет ни у одной категории.
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
    const clickStartedAt = performance.now();
    setLoading(true);
    setError(null);
    const res = await perfFetch(
      "admin.publish_results",
      `/api/competitions/${competitionId}/results/publish`,
      { method: "POST" },
      clickStartedAt
    );
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
    <section className="rounded-app border border-admin-border bg-admin-card p-[18px]">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="m-0 text-sm font-extrabold text-night-text">Публикация результатов соревнования</h3>
        {publicResults && <span className="rounded-full bg-night-success/15 px-2.5 py-1 text-xs font-bold text-night-success">Опубликовано</span>}
      </div>

      {publicResults ? (
        <>
          <p className="m-0 mt-3 text-sm text-admin-muted">Результаты опубликованы и видны публично.</p>
          {!unpublishing ? (
            <button
              type="button"
              className="mt-3 text-sm font-semibold text-admin-muted hover:text-admin-primaryHover"
              onClick={() => setUnpublishing(true)}
            >
              Отменить публикацию
            </button>
          ) : (
            <form onSubmit={unpublish} className="mt-3 flex flex-col gap-2.5">
              <Label className="text-night-text">
                Причина отмены публикации
                <Input value={reason} onChange={(e) => setReason(e.target.value)} required className={FIELD_CLASS} />
              </Label>
              <div className="flex items-center gap-2">
                <Button type="submit" size="sm" variant="admin" disabled={loading || !reason.trim()}>
                  Отменить публикацию
                </Button>
                <button
                  type="button"
                  className="text-sm font-semibold text-admin-muted hover:text-admin-primaryHover"
                  disabled={loading}
                  onClick={() => setUnpublishing(false)}
                >
                  отмена
                </button>
              </div>
            </form>
          )}
        </>
      ) : (
        <>
          {issues === null && <p className="m-0 mt-3 text-sm text-admin-muted">Проверка готовности…</p>}
          {issues && issues.length > 0 && (
            <ul className="m-0 mt-3 flex flex-col gap-0.5 pl-4">
              {issues.map((i, idx) => (
                <li key={idx} className="text-sm text-red-400">
                  {i}
                </li>
              ))}
            </ul>
          )}
          {issues && issues.length === 0 && <p className="m-0 mt-3 text-sm text-admin-muted">Все категории рассчитаны и проверены — можно публиковать.</p>}
          <Button type="button" size="sm" variant="admin" className="mt-3" disabled={loading || !issues || issues.length > 0} onClick={publish}>
            Опубликовать результаты
          </Button>
        </>
      )}
      {error && <p className="m-0 mt-2 text-sm text-red-400">{error}</p>}
    </section>
  );
}
