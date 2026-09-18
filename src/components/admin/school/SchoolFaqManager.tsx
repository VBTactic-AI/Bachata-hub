"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SchoolFaqFormModal, type SchoolFaqFormValue } from "./SchoolFaqFormModal";

export function SchoolFaqManager({ schoolSlug, items }: { schoolSlug: string; items: SchoolFaqFormValue[] }) {
  const router = useRouter();
  const [modal, setModal] = useState<{ mode: "create" | "edit"; item?: SchoolFaqFormValue } | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(id: string, question: string) {
    if (!window.confirm(`Удалить вопрос «${question}»?`)) return;
    setLoadingId(id);
    setError(null);
    const res = await fetch(`/api/schools/${schoolSlug}/faq/${id}`, { method: "DELETE" });
    setLoadingId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.message || data.error || "Не удалось удалить вопрос.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="rounded-app border border-admin-border bg-admin-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="m-0 text-sm font-semibold uppercase tracking-wide text-admin-muted">FAQ</h2>
        <Button type="button" variant="adminOutline" size="sm" onClick={() => setModal({ mode: "create" })}>
          Вопрос
        </Button>
      </div>

      {error && <p className="m-0 mt-2 text-xs text-red-400">{error}</p>}

      {items.length === 0 ? (
        <p className="m-0 mt-3 text-sm text-admin-muted">Вопросов пока нет.</p>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {items.map((item) => (
            <div key={item.id} className="rounded-app-sm border border-admin-border px-3 py-2 text-sm">
              <div className="flex items-start justify-between gap-2">
                <p className="m-0 font-semibold text-night-text">{item.question}</p>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    className="text-xs text-admin-muted hover:text-night-text hover:underline"
                    onClick={() => setModal({ mode: "edit", item })}
                  >
                    Изменить
                  </button>
                  <button
                    type="button"
                    disabled={loadingId === item.id}
                    className="text-xs text-admin-muted hover:text-red-400 hover:underline"
                    onClick={() => handleDelete(item.id, item.question)}
                  >
                    Удалить
                  </button>
                </div>
              </div>
              <p className="m-0 mt-1 whitespace-pre-wrap text-admin-muted">{item.answer}</p>
            </div>
          ))}
        </div>
      )}

      {modal && <SchoolFaqFormModal schoolSlug={schoolSlug} mode={modal.mode} initial={modal.item} onClose={() => setModal(null)} />}
    </div>
  );
}
