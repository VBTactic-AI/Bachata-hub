"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { Button } from "@/components/ui/button";

export type ReviewRow = {
  id: string;
  rating: number;
  text: string;
  moderationStatus: "PENDING" | "APPROVED" | "REJECTED";
  authorLabel: string;
  createdAt: string;
};

const STATUS_LABELS = { PENDING: "Ожидает проверки", APPROVED: "Опубликован", REJECTED: "Отклонён" } as const;
const STATUS_VARIANTS = { PENDING: "warning", APPROVED: "success", REJECTED: "danger" } as const;

// Модерация отзывов о фестивале — организатор ЭТОГО фестиваля, не сайтовый
// модератор (прямое решение пользователя, Stage 3 сервисного слоя,
// festival-review-service.ts) — тот же контракт action:"approve"|"reject",
// что и у сайтовой модерации отзывов школ.
export function FestivalReviewModeration({ festivalId, reviews }: { festivalId: string; reviews: ReviewRow[] }) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(id: string, action: "approve" | "reject") {
    setLoadingId(id);
    setError(null);
    const res = await fetch(`/api/festivals/${festivalId}/reviews/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setLoadingId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.message || data.error || "Не удалось сохранить решение.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="rounded-app border border-admin-border bg-admin-card p-4">
      <h2 className="m-0 text-sm font-semibold uppercase tracking-wide text-admin-muted">Отзывы</h2>
      {error && <p className="m-0 mt-2 text-xs text-red-400">{error}</p>}

      {reviews.length === 0 ? (
        <p className="m-0 mt-3 text-sm text-admin-muted">Отзывов пока нет.</p>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {reviews.map((r) => (
            <div key={r.id} className="rounded-app-sm border border-admin-border px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-night-text">{"★".repeat(r.rating)}</span>
                <span className="text-admin-muted">{r.authorLabel}</span>
                <StatusBadge label={STATUS_LABELS[r.moderationStatus]} variant={STATUS_VARIANTS[r.moderationStatus]} className="ml-auto" />
              </div>
              <p className="m-0 mt-1 whitespace-pre-wrap text-night-text">{r.text}</p>
              {r.moderationStatus === "PENDING" && (
                <div className="mt-2 flex gap-2">
                  <Button type="button" size="sm" variant="admin" disabled={loadingId === r.id} onClick={() => decide(r.id, "approve")}>
                    Опубликовать
                  </Button>
                  <Button type="button" size="sm" variant="adminOutline" disabled={loadingId === r.id} onClick={() => decide(r.id, "reject")}>
                    Отклонить
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
