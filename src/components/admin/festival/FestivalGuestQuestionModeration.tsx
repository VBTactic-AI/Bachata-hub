"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Textarea } from "@/components/ui/field";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { Button } from "@/components/ui/button";

const FIELD_CLASS = "border-admin-border bg-admin-card2 text-night-text focus:border-admin-primary focus:ring-admin-primary/20";

export type GuestQuestionRow = {
  id: string;
  askerName: string | null;
  question: string;
  moderationStatus: "PENDING" | "APPROVED" | "REJECTED";
  answer: string | null;
};

const STATUS_LABELS = { PENDING: "Ожидает проверки", APPROVED: "Видно на сайте", REJECTED: "Скрыто" } as const;
const STATUS_VARIANTS = { PENDING: "warning", APPROVED: "success", REJECTED: "danger" } as const;

// Вопросы гостей — ДВЕ независимые оси (Stage 3 сервисного слоя,
// festival-guest-question-service.ts): moderationStatus (видимость, спам-
// фильтр) и answer (ответил ли организатор) — вопрос может быть одобрен, но
// без ответа ("Ожидает ответа" на публичной странице). Форма ответа не
// зависит от статуса модерации — можно ответить и до одобрения.
export function FestivalGuestQuestionModeration({ festivalId, items }: { festivalId: string; items: GuestQuestionRow[] }) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [answering, setAnswering] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  async function moderate(id: string, action: "approve" | "reject") {
    setLoadingId(id);
    setError(null);
    const res = await fetch(`/api/festivals/${festivalId}/guest-questions/${id}`, {
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

  async function submitAnswer(id: string) {
    const answer = (answering[id] ?? "").trim();
    if (!answer) return;
    setLoadingId(id);
    setError(null);
    const res = await fetch(`/api/festivals/${festivalId}/guest-questions/${id}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answer }),
    });
    setLoadingId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.message || data.error || "Не удалось сохранить ответ.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="rounded-app border border-admin-border bg-admin-card p-4">
      <h2 className="m-0 text-sm font-semibold uppercase tracking-wide text-admin-muted">Вопросы гостей</h2>
      {error && <p className="m-0 mt-2 text-xs text-red-400">{error}</p>}

      {items.length === 0 ? (
        <p className="m-0 mt-3 text-sm text-admin-muted">Вопросов пока нет.</p>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {items.map((item) => (
            <div key={item.id} className="rounded-app-sm border border-admin-border px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-night-text">{item.askerName || "Гость"}</span>
                <StatusBadge label={STATUS_LABELS[item.moderationStatus]} variant={STATUS_VARIANTS[item.moderationStatus]} className="ml-auto" />
              </div>
              <p className="m-0 mt-1 text-night-text">{item.question}</p>

              {item.moderationStatus === "PENDING" && (
                <div className="mt-2 flex gap-2">
                  <Button type="button" size="sm" variant="admin" disabled={loadingId === item.id} onClick={() => moderate(item.id, "approve")}>
                    Одобрить
                  </Button>
                  <Button type="button" size="sm" variant="adminOutline" disabled={loadingId === item.id} onClick={() => moderate(item.id, "reject")}>
                    Скрыть
                  </Button>
                </div>
              )}

              {item.answer ? (
                <p className="m-0 mt-2 rounded-app-sm bg-admin-card2 p-2 text-admin-muted">Ответ: {item.answer}</p>
              ) : (
                <div className="mt-2 flex flex-col gap-2">
                  <Textarea
                    value={answering[item.id] ?? ""}
                    onChange={(e) => setAnswering((prev) => ({ ...prev, [item.id]: e.target.value }))}
                    className={FIELD_CLASS}
                    rows={2}
                    placeholder="Ваш ответ…"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="adminOutline"
                    disabled={loadingId === item.id || !(answering[item.id] ?? "").trim()}
                    onClick={() => submitAnswer(item.id)}
                    className="self-start"
                  >
                    Ответить
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
