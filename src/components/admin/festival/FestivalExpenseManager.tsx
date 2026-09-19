"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/admin/ConfirmModal";
import { PencilIcon, TrashIcon } from "@/components/admin/icons";
import { cn } from "@/lib/cn";
import { ExpenseFormModal, EXPENSE_CATEGORY_LABELS, EXPENSE_STATUS_LABELS, type ExpenseFormValue } from "./ExpenseFormModal";

const CATEGORY_CHIP_COLOR: Record<string, string> = {
  ARTISTS: "bg-admin-primary",
  VENUE: "bg-admin-violet",
  MARKETING: "bg-night-warning",
  EQUIPMENT: "bg-night-success",
  OTHER: "bg-admin-disabled",
};

// Строки с цветной категорией вместо таблицы (перенос UI-прототипа Festival
// Engine, Stage R8, 2026-09-19) — удаление через ConfirmModal вместо
// window.confirm.
export function FestivalExpenseManager({ festivalId, expenses }: { festivalId: string; expenses: ExpenseFormValue[] }) {
  const router = useRouter();
  const [modal, setModal] = useState<{ mode: "create" | "edit"; expense?: ExpenseFormValue } | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<ExpenseFormValue | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(expense: ExpenseFormValue) {
    setLoadingId(expense.id);
    setError(null);
    const res = await fetch(`/api/festivals/${festivalId}/expenses/${expense.id}`, { method: "DELETE" });
    setLoadingId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.message || data.error || "Не удалось удалить статью расходов.");
      return;
    }
    setConfirmingDelete(null);
    router.refresh();
  }

  return (
    <div className="rounded-app border border-admin-border bg-admin-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="m-0 text-sm font-semibold uppercase tracking-wide text-admin-muted">Расходы</h2>
        <Button type="button" variant="adminOutline" size="sm" onClick={() => setModal({ mode: "create" })}>
          Статья расходов
        </Button>
      </div>

      {error && <p className="m-0 mt-2 text-xs text-red-400">{error}</p>}

      {expenses.length === 0 ? (
        <p className="m-0 mt-3 text-sm text-admin-muted">Расходов пока нет.</p>
      ) : (
        <div className="mt-3 rounded-app-sm border border-admin-border">
          {expenses.map((e) => (
            <div key={e.id} className="flex items-center gap-3 border-b border-admin-border px-3 py-2.5 last:border-none">
              <span className={cn("h-2.5 w-2.5 shrink-0 rounded-sm", CATEGORY_CHIP_COLOR[e.category] ?? CATEGORY_CHIP_COLOR.OTHER)} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="m-0 truncate text-sm font-semibold text-night-text">{e.title}</p>
                <p className="m-0 text-xs text-admin-muted">{EXPENSE_CATEGORY_LABELS[e.category] ?? e.category}</p>
              </div>
              <StatusBadge label={EXPENSE_STATUS_LABELS[e.status] ?? e.status} variant={e.status === "PAID" ? "success" : "warning"} />
              <span className="w-20 shrink-0 text-right text-sm font-bold tabular-nums text-night-text">
                {e.amount} {e.currency ?? ""}
              </span>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  title="Изменить"
                  aria-label="Изменить статью расходов"
                  onClick={() => setModal({ mode: "edit", expense: e })}
                  className="inline-flex items-center justify-center rounded-app-sm p-1.5 text-admin-muted hover:bg-admin-card2 hover:text-night-text"
                >
                  <PencilIcon />
                </button>
                <button
                  type="button"
                  title="Удалить"
                  aria-label="Удалить статью расходов"
                  disabled={loadingId === e.id}
                  onClick={() => setConfirmingDelete(e)}
                  className="inline-flex items-center justify-center rounded-app-sm p-1.5 text-admin-muted hover:bg-red-400/10 hover:text-red-400 disabled:opacity-50"
                >
                  <TrashIcon />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && <ExpenseFormModal festivalId={festivalId} mode={modal.mode} initial={modal.expense} onClose={() => setModal(null)} />}

      {confirmingDelete && (
        <ConfirmModal
          title="Удалить статью расходов?"
          message={`«${confirmingDelete.title}» будет удалена без возможности восстановления.`}
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
