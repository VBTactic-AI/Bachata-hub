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
//
// Ответ — оверлей-модалка вместо всегда открытой инлайн-формы под каждым
// вопросом (Stage R7 переноса UI-прототипа, 2026-09-19, единый модальный
// паттерн проекта).
export function FestivalGuestQuestionModeration({ festivalId, items }: { festivalId: string; items: GuestQuestionRow[] }) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [answerModal, setAnswerModal] = useState<GuestQuestionRow | null>(null);
  const [answerText, setAnswerText] = useState("");
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

  async function submitAnswer() {
    if (!answerModal || !answerText.trim()) return;
    setLoadingId(answerModal.id);
    setError(null);
    const res = await fetch(`/api/festivals/${festivalId}/guest-questions/${answerModal.id}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answer: answerText.trim() }),
    });
    setLoadingId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.message || data.error || "Не удалось сохранить ответ.");
      return;
    }
    setAnswerModal(null);
    setAnswerText("");
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

              <div className="mt-2 flex flex-wrap gap-2">
                {item.moderationStatus === "PENDING" && (
                  <>
                    <Button type="button" size="sm" variant="admin" disabled={loadingId === item.id} onClick={() => moderate(item.id, "approve")}>
                      Одобрить
                    </Button>
                    <Button type="button" size="sm" variant="adminOutline" disabled={loadingId === item.id} onClick={() => moderate(item.id, "reject")}>
                      Скрыть
                    </Button>
                  </>
                )}
                {!item.answer && (
                  <Button
                    type="button"
                    size="sm"
                    variant="adminOutline"
                    disabled={loadingId === item.id}
                    onClick={() => {
                      setAnswerModal(item);
                      setAnswerText("");
                    }}
                  >
                    Ответить
                  </Button>
                )}
              </div>

              {item.answer && <p className="m-0 mt-2 rounded-app-sm bg-admin-card2 p-2 text-admin-muted">Ответ: {item.answer}</p>}
            </div>
          ))}
        </div>
      )}

      {answerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5" onClick={() => setAnswerModal(null)} role="presentation">
          <div
            className="flex max-h-[90vh] w-full max-w-[460px] flex-col overflow-hidden rounded-app border border-admin-border bg-admin-card shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="answer-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-admin-border px-5 py-4">
              <h3 id="answer-modal-title" className="m-0 text-[15px] font-extrabold text-night-text">
                Ответ на вопрос гостя
              </h3>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <p className="m-0 mb-3 text-sm text-admin-muted">
                {answerModal.askerName || "Гость"}: «{answerModal.question}»
              </p>
              <Textarea
                value={answerText}
                onChange={(e) => setAnswerText(e.target.value)}
                className={FIELD_CLASS}
                rows={4}
                placeholder="Ваш ответ…"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2 border-t border-admin-border px-5 py-4">
              <Button type="button" variant="adminOutline" onClick={() => setAnswerModal(null)} disabled={loadingId === answerModal.id}>
                Отмена
              </Button>
              <Button type="button" variant="admin" disabled={loadingId === answerModal.id || !answerText.trim()} onClick={submitAnswer}>
                {loadingId === answerModal.id ? "Сохранение…" : "Ответить"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
