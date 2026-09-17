"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { Button } from "@/components/ui/button";
import { ExpenseFormModal, EXPENSE_CATEGORY_LABELS, EXPENSE_STATUS_LABELS, type ExpenseFormValue } from "./ExpenseFormModal";

export function FestivalExpenseManager({ festivalId, expenses }: { festivalId: string; expenses: ExpenseFormValue[] }) {
  const router = useRouter();
  const [modal, setModal] = useState<{ mode: "create" | "edit"; expense?: ExpenseFormValue } | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(id: string, title: string) {
    if (!window.confirm(`Удалить статью расходов «${title}»?`)) return;
    setLoadingId(id);
    setError(null);
    const res = await fetch(`/api/festivals/${festivalId}/expenses/${id}`, { method: "DELETE" });
    setLoadingId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.message || data.error || "Не удалось удалить статью расходов.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="rounded-app border border-admin-border bg-admin-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="m-0 text-sm font-semibold uppercase tracking-wide text-admin-muted">Расходы</h2>
        <Button type="button" variant="adminOutline" size="sm" onClick={() => setModal({ mode: "create" })}>
          + Статья расходов
        </Button>
      </div>

      {error && <p className="m-0 mt-2 text-xs text-red-400">{error}</p>}

      {expenses.length === 0 ? (
        <p className="m-0 mt-3 text-sm text-admin-muted">Расходов пока нет.</p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-app-sm border border-admin-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-admin-card2 text-xs font-semibold uppercase tracking-wide text-admin-disabled">
              <tr>
                <th className="px-3 py-2 font-semibold">Статья</th>
                <th className="px-3 py-2 text-right font-semibold">Сумма</th>
                <th className="px-3 py-2 font-semibold">Статус</th>
                <th className="px-3 py-2 text-right font-semibold">Действия</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => (
                <tr key={e.id} className="border-t border-admin-border hover:bg-admin-card2/50">
                  <td className="px-3 py-2 align-top">
                    <p className="m-0 font-medium text-night-text">{e.title}</p>
                    <p className="m-0 text-xs text-admin-muted">{EXPENSE_CATEGORY_LABELS[e.category] ?? e.category}</p>
                  </td>
                  <td className="px-3 py-2 align-top text-right tabular-nums text-night-text">
                    {e.amount} {e.currency ?? ""}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <StatusBadge label={EXPENSE_STATUS_LABELS[e.status] ?? e.status} variant={e.status === "PAID" ? "success" : "warning"} />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        className="text-xs text-admin-muted hover:text-night-text hover:underline"
                        onClick={() => setModal({ mode: "edit", expense: e })}
                      >
                        Изменить
                      </button>
                      <button
                        type="button"
                        disabled={loadingId === e.id}
                        className="text-xs text-admin-muted hover:text-red-400 hover:underline"
                        onClick={() => handleDelete(e.id, e.title)}
                      >
                        Удалить
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && <ExpenseFormModal festivalId={festivalId} mode={modal.mode} initial={modal.expense} onClose={() => setModal(null)} />}
    </div>
  );
}
