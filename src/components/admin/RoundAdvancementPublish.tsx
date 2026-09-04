"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label, Input } from "@/components/ui/field";

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
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/rounds/${roundId}/advancement/publish`, { method: "POST" });
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

  if (publishedAt) {
    return (
      <div className="mt-1">
        <p className="hint-text m-0">Список прошедших опубликован {new Date(publishedAt).toLocaleString("ru-RU")}</p>
        {!unpublishing ? (
          <Button type="button" size="sm" variant="ghost" onClick={() => setUnpublishing(true)}>
            отменить публикацию
          </Button>
        ) : (
          <form onSubmit={unpublish} className="flex flex-wrap items-center gap-2 mt-1">
            <Label className="flex-1 min-w-[180px]">
              Причина
              <Input value={reason} onChange={(e) => setReason(e.target.value)} required />
            </Label>
            <Button type="submit" size="sm" variant="secondary" disabled={loading || !reason.trim()}>
              Отменить
            </Button>
          </form>
        )}
        {error && <span className="error-text">{error}</span>}
      </div>
    );
  }

  return (
    <div className="mt-1 flex items-center gap-2">
      <Button type="button" size="sm" variant="ghost" disabled={loading} onClick={publish}>
        Опубликовать список прошедших
      </Button>
      {error && <span className="error-text">{error}</span>}
    </div>
  );
}
