"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label, Input } from "@/components/ui/field";
import { perfFetch } from "@/lib/performance-debug/client";

// Тот же приём переопределения полей, что и в CompetitionResultsPanel.tsx/
// DivisionResultsPanel.tsx (redesign 2026-09-09, под admin-* палитру —
// CompetitionMonitor.tsx рендерит эту панель в отдельной тёмной секции, не
// смешивая со светлыми panels остальных этапов).
const FIELD_CLASS = "border-admin-border bg-admin-card2 text-night-text focus:border-admin-primary focus:ring-admin-primary/20";

// Публикация списка "кто прошёл дальше" ОДНОГО раунда — независимо от
// публикации финальных мест всего соревнования (CompetitionResultsPanel).
// Уточнено пользователем (2026-09-04): организатор может показать
// промежуточный список сразу после раунда, не дожидаясь конца конкурса.
export function RoundAdvancementPublish({ roundId, publishedAt }: { roundId: string; publishedAt: string | null }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unpublishing, setUnpublishing] = useState(false);
  const [reason, setReason] = useState("");

  async function publish() {
    const clickStartedAt = performance.now();
    setLoading(true);
    setError(null);
    const res = await perfFetch(
      "admin.advancement_publish",
      `/api/rounds/${roundId}/advancement/publish`,
      { method: "POST" },
      clickStartedAt
    );
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось опубликовать список.");
      return;
    }
    router.refresh();
  }

  async function unpublish(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/rounds/${roundId}/advancement/unpublish`, {
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
    <div>
      <h3 className="m-0 mb-1 text-sm font-extrabold text-night-text">Публикация прохождения раунда</h3>

      {publishedAt ? (
        <>
          <p className="m-0 mt-2 text-sm text-admin-muted">Список прошедших опубликован {new Date(publishedAt).toLocaleString("ru-RU")}</p>
          {!unpublishing ? (
            <button
              type="button"
              className="mt-2 text-sm font-semibold text-admin-muted hover:text-admin-primaryHover"
              onClick={() => setUnpublishing(true)}
            >
              отменить публикацию
            </button>
          ) : (
            <form onSubmit={unpublish} className="mt-2 flex flex-wrap items-end gap-2">
              <Label className="min-w-[180px] flex-1 text-night-text">
                Причина
                <Input value={reason} onChange={(e) => setReason(e.target.value)} required className={FIELD_CLASS} />
              </Label>
              <Button type="submit" size="sm" variant="admin" disabled={loading || !reason.trim()}>
                Отменить
              </Button>
            </form>
          )}
        </>
      ) : (
        <div className="mt-2 flex items-center gap-2">
          <Button type="button" size="sm" variant="admin" disabled={loading} onClick={publish}>
            Опубликовать список прошедших
          </Button>
        </div>
      )}
      {error && <p className="m-0 mt-2 text-sm text-red-400">{error}</p>}
    </div>
  );
}
