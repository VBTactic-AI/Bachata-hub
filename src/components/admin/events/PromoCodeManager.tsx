"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/admin/ConfirmModal";
import { PencilIcon, TrashIcon } from "@/components/admin/icons";
import { PromoCodeFormModal } from "./PromoCodeFormModal";

export type PromoCodeRow = {
  id: string;
  code: string;
  discountType: "PERCENT" | "FIXED_AMOUNT";
  discountValue: number;
  usedCount: number;
  maxUses: number | null;
  isActive: boolean;
};

// Промокоды события — только конфигурация (см. комментарий у PromoCode в
// schema.prisma): расчёт скидки при выдаче билета ещё не реализован, здесь
// только создание/редактирование/удаление/активация. Редактирование
// попапом + удаление корзинкой (перенос UI-прототипа, Stage F, 2026-09-20,
// по прямому запросу пользователя) — тот же модальный паттерн, что и у
// остальных менеджеров.
export function PromoCodeManager({ eventSlug, initialCodes }: { eventSlug: string; initialCodes: PromoCodeRow[] }) {
  const router = useRouter();
  const [codes, setCodes] = useState(initialCodes);
  const [modal, setModal] = useState<{ mode: "create" | "edit"; code?: PromoCodeRow } | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<PromoCodeRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(c: PromoCodeRow) {
    setDeleting(true);
    setError(null);
    const res = await fetch(`/api/events/${eventSlug}/promo-codes/${c.id}`, { method: "DELETE" });
    setDeleting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.message ?? "Не удалось удалить промокод.");
      return;
    }
    setCodes((prev) => prev.filter((x) => x.id !== c.id));
    setConfirmingDelete(null);
    router.refresh();
  }

  return (
    <div className="rounded-app border border-admin-border bg-admin-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="m-0 text-sm font-semibold uppercase tracking-wide text-admin-muted">Промокоды</h2>
        <Button type="button" variant="adminOutline" size="sm" onClick={() => setModal({ mode: "create" })}>
          Добавить промокод
        </Button>
      </div>

      {error && <p className="m-0 mt-2 text-xs text-red-400">{error}</p>}

      {codes.length === 0 ? (
        <p className="m-0 mt-3 text-sm text-admin-muted">Промокодов пока нет.</p>
      ) : (
        <div className="mt-3 flex flex-col gap-1.5">
          {codes.map((c) => (
            <div key={c.id} className="flex items-center gap-2 rounded-app-sm border border-admin-border px-3 py-2 text-sm">
              <span className="font-mono font-semibold text-night-text">{c.code}</span>
              <span className="text-admin-muted">{c.discountType === "PERCENT" ? `-${c.discountValue}%` : `-${c.discountValue} BYN`}</span>
              <span className="text-admin-muted">
                {c.usedCount}
                {c.maxUses != null ? ` / ${c.maxUses}` : ""} использований
              </span>
              <StatusBadge label={c.isActive ? "Активен" : "Выключен"} variant={c.isActive ? "success" : "neutral"} className="ml-auto" />
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  title="Редактировать"
                  aria-label="Редактировать промокод"
                  onClick={() => setModal({ mode: "edit", code: c })}
                  className="inline-flex items-center justify-center rounded-app-sm p-1.5 text-admin-muted hover:bg-admin-card2 hover:text-night-text"
                >
                  <PencilIcon />
                </button>
                <button
                  type="button"
                  title="Удалить"
                  aria-label="Удалить промокод"
                  disabled={deleting}
                  onClick={() => setConfirmingDelete(c)}
                  className="inline-flex items-center justify-center rounded-app-sm p-1.5 text-admin-muted hover:bg-red-400/10 hover:text-red-400 disabled:opacity-50"
                >
                  <TrashIcon />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <PromoCodeFormModal
          eventSlug={eventSlug}
          mode={modal.mode}
          initial={modal.code}
          onClose={() => setModal(null)}
          onSaved={(saved) => {
            setCodes((prev) => (modal.mode === "create" ? [saved, ...prev] : prev.map((c) => (c.id === saved.id ? saved : c))));
            router.refresh();
          }}
        />
      )}

      {confirmingDelete && (
        <ConfirmModal
          title="Удалить промокод?"
          message={
            confirmingDelete.usedCount > 0
              ? `«${confirmingDelete.code}» уже использовался (${confirmingDelete.usedCount} раз) — удалить нельзя, только выключить в редактировании.`
              : `«${confirmingDelete.code}» будет удалён без возможности восстановления.`
          }
          confirmLabel="Удалить"
          danger
          pending={deleting}
          onConfirm={() => handleDelete(confirmingDelete)}
          onClose={() => setConfirmingDelete(null)}
        />
      )}
    </div>
  );
}
