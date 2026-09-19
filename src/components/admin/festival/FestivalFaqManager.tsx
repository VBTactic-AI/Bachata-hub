"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/admin/ConfirmModal";
import { PencilIcon, TrashIcon, ChevronRightIcon } from "@/components/admin/icons";
import { FaqFormModal, type FaqFormValue } from "./FaqFormModal";
import { cn } from "@/lib/cn";

// Аккордеон вместо всегда развёрнутого списка (перенос UI-прототипа
// Festival Engine, Stage R7, 2026-09-19) — раскрыт только выбранный вопрос,
// остальные свёрнуты, как в макете. Удаление — через ConfirmModal вместо
// window.confirm.
export function FestivalFaqManager({ festivalId, items }: { festivalId: string; items: FaqFormValue[] }) {
  const router = useRouter();
  const [modal, setModal] = useState<{ mode: "create" | "edit"; item?: FaqFormValue } | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<FaqFormValue | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(item: FaqFormValue) {
    setLoadingId(item.id);
    setError(null);
    const res = await fetch(`/api/festivals/${festivalId}/faq/${item.id}`, { method: "DELETE" });
    setLoadingId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.message || data.error || "Не удалось удалить вопрос.");
      return;
    }
    setConfirmingDelete(null);
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
        <div className="mt-3 flex flex-col">
          {items.map((item) => {
            const open = openId === item.id;
            return (
              <div key={item.id} className="border-b border-admin-border py-2.5 last:border-none">
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : item.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <span className={cn("shrink-0 text-admin-muted transition-transform", open && "rotate-90")}>
                      <ChevronRightIcon />
                    </span>
                    <span className="truncate text-sm font-semibold text-night-text">{item.question}</span>
                  </button>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      title="Изменить"
                      aria-label="Изменить вопрос"
                      onClick={() => setModal({ mode: "edit", item })}
                      className="inline-flex items-center justify-center rounded-app-sm p-1.5 text-admin-muted hover:bg-admin-card2 hover:text-night-text"
                    >
                      <PencilIcon />
                    </button>
                    <button
                      type="button"
                      title="Удалить"
                      aria-label="Удалить вопрос"
                      disabled={loadingId === item.id}
                      onClick={() => setConfirmingDelete(item)}
                      className="inline-flex items-center justify-center rounded-app-sm p-1.5 text-admin-muted hover:bg-red-400/10 hover:text-red-400 disabled:opacity-50"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </div>
                {open && <p className="m-0 mt-2 whitespace-pre-wrap pl-6 text-sm text-admin-muted">{item.answer}</p>}
              </div>
            );
          })}
        </div>
      )}

      {modal && <FaqFormModal festivalId={festivalId} mode={modal.mode} initial={modal.item} onClose={() => setModal(null)} />}

      {confirmingDelete && (
        <ConfirmModal
          title="Удалить вопрос?"
          message={`«${confirmingDelete.question}» будет удалён без возможности восстановления.`}
          confirmLabel="Удалить"
          danger
          pending={loadingId === confirmingDelete.id}
          onConfirm={() => handleDelete(confirmingDelete)}
          onClose={() => setConfirmingDelete(null)}
        />
      )}
    </div>
  );
}
