"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Textarea, Label } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

const FIELD_CLASS = "border-admin-border bg-admin-card2 text-night-text focus:border-admin-primary focus:ring-admin-primary/20";

export type SchoolFaqFormValue = { id: string; question: string; answer: string };

// По образцу src/components/admin/festival/FaqFormModal.tsx (Festival Engine
// Stage 2) — тот же CRUD-паттерн для FAQ школы, путь API отличается
// (/api/schools/[slug]/faq вместо /api/festivals/[id]/faq).
export function SchoolFaqFormModal({
  schoolSlug,
  mode,
  initial,
  onClose,
}: {
  schoolSlug: string;
  mode: "create" | "edit";
  initial?: SchoolFaqFormValue;
  onClose: () => void;
}) {
  const router = useRouter();
  const [question, setQuestion] = useState(initial?.question ?? "");
  const [answer, setAnswer] = useState(initial?.answer ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const url = mode === "create" ? `/api/schools/${schoolSlug}/faq` : `/api/schools/${schoolSlug}/faq/${initial!.id}`;
      const res = await fetch(url, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, answer }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.message ?? "Не удалось сохранить вопрос.");
        return;
      }
      onClose();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5" onClick={onClose} role="presentation">
      <div
        className="flex max-h-[90vh] w-full max-w-[480px] flex-col overflow-hidden rounded-app border border-admin-border bg-admin-card shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="school-faq-form-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-admin-border px-5 py-4">
          <h3 id="school-faq-form-title" className="m-0 text-[17px] font-extrabold text-night-text">
            {mode === "create" ? "Новый вопрос FAQ" : "Редактировать вопрос FAQ"}
          </h3>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <div className="flex flex-col gap-4">
              {error && <p className="m-0 text-sm text-red-400">{error}</p>}

              <Label className="text-admin-muted">
                Вопрос
                <Textarea value={question} onChange={(e) => setQuestion(e.target.value)} className={FIELD_CLASS} rows={2} required />
              </Label>

              <Label className="text-admin-muted">
                Ответ
                <Textarea value={answer} onChange={(e) => setAnswer(e.target.value)} className={FIELD_CLASS} rows={4} required />
              </Label>
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-admin-border px-5 py-4">
            <Button type="button" variant="adminOutline" onClick={onClose} disabled={saving}>
              Отмена
            </Button>
            <Button type="submit" variant="admin" disabled={saving || !question.trim() || !answer.trim()}>
              {saving ? "Сохранение…" : "Сохранить"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
