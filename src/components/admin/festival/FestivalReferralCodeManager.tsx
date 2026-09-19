"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/admin/ConfirmModal";
import { PencilIcon, TrashIcon } from "@/components/admin/icons";
import { ReferralCodeFormModal } from "./ReferralCodeFormModal";

export type ReferralOwnerOption = { id: string; label: string };

export type ReferralCodeRow = {
  id: string;
  code: string;
  ownerLabel: string;
  ownerTeacherId?: string | null;
  ownerSchoolId?: string | null;
  discountType: "PERCENT" | "FIXED_AMOUNT" | null;
  discountValue: number | null;
  commissionType: "PERCENT" | "FIXED_AMOUNT";
  commissionValue: number;
  active: boolean;
};

type StatsState = { ticketCount: number; totalDiscountAmount: number; totalCommissionAmount: number } | "loading" | null;

// Реферальные коды артистов/школ — Stage 4 сервисного слоя
// (docs/FESTIVAL_SERVICE_LAYER_PLAN.md), отдельная модель от PromoCode:
// атрибуция продаж конкретному владельцу, скидка покупателю опциональна.
//
// Создание/редактирование — оверлей-модалка (Stage R6/Stage F переноса
// UI-прототипа, 2026-09-19/20, единый модальный паттерн проекта) — попап
// отдаёт готовую строку через onSaved, поэтому новый код появляется в
// таблице сразу, без router.refresh() (найденный вживую баг — раньше
// строка не добавлялась в локальный список, только после ручного
// обновления страницы). Удаление корзинкой — по прямому запросу
// пользователя, отменяет более раннее решение "без удаления".
export function FestivalReferralCodeManager({
  festivalId,
  initialCodes,
  teachers,
  schools,
}: {
  festivalId: string;
  initialCodes: ReferralCodeRow[];
  teachers: ReferralOwnerOption[];
  schools: ReferralOwnerOption[];
}) {
  const router = useRouter();
  const [codes, setCodes] = useState(initialCodes);
  const [modal, setModal] = useState<{ mode: "create" | "edit"; code?: ReferralCodeRow } | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<ReferralCodeRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [stats, setStats] = useState<Record<string, StatsState>>({});

  async function handleDelete(c: ReferralCodeRow) {
    setDeleting(true);
    setDeleteError(null);
    const res = await fetch(`/api/festivals/${festivalId}/referral-codes/${c.id}`, { method: "DELETE" });
    setDeleting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setDeleteError(data?.message ?? "Не удалось удалить код.");
      return;
    }
    setCodes((prev) => prev.filter((x) => x.id !== c.id));
    setConfirmingDelete(null);
    router.refresh();
  }

  async function loadStats(id: string) {
    setStats((prev) => ({ ...prev, [id]: "loading" }));
    const res = await fetch(`/api/festivals/${festivalId}/referral-codes/${id}/stats`);
    const data = await res.json().catch(() => null);
    setStats((prev) => ({ ...prev, [id]: res.ok ? data.stats : null }));
  }

  return (
    <div className="rounded-app border border-admin-border bg-admin-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="m-0 text-sm font-semibold uppercase tracking-wide text-admin-muted">Реферальные коды</h2>
        <Button type="button" variant="adminOutline" size="sm" onClick={() => setModal({ mode: "create" })}>
          Добавить реферальный код
        </Button>
      </div>

      {codes.length === 0 ? (
        <p className="m-0 mt-3 text-sm text-admin-muted">Реферальных кодов пока нет.</p>
      ) : (
        <div className="mt-3 flex flex-col gap-1.5">
          {codes.map((c) => {
            const codeStats = stats[c.id];
            return (
              <div key={c.id} className="rounded-app-sm border border-admin-border px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-semibold text-night-text">{c.code}</span>
                  <span className="text-admin-muted">{c.ownerLabel}</span>
                  <span className="text-admin-muted">
                    комиссия {c.commissionType === "PERCENT" ? `${c.commissionValue}%` : `${c.commissionValue} BYN`}
                  </span>
                  {c.discountValue != null && (
                    <span className="text-admin-muted">
                      скидка {c.discountType === "PERCENT" ? `${c.discountValue}%` : `${c.discountValue} BYN`}
                    </span>
                  )}
                  <StatusBadge label={c.active ? "Активен" : "Выключен"} variant={c.active ? "success" : "neutral"} className="ml-auto" />
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      title="Редактировать"
                      aria-label="Редактировать код"
                      onClick={() => setModal({ mode: "edit", code: c })}
                      className="inline-flex items-center justify-center rounded-app-sm p-1.5 text-admin-muted hover:bg-admin-card2 hover:text-night-text"
                    >
                      <PencilIcon />
                    </button>
                    <button
                      type="button"
                      title="Удалить"
                      aria-label="Удалить код"
                      onClick={() => setConfirmingDelete(c)}
                      className="inline-flex items-center justify-center rounded-app-sm p-1.5 text-admin-muted hover:bg-red-400/10 hover:text-red-400"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </div>
                {codeStats == null ? (
                  <button type="button" className="mt-1 text-xs text-admin-primaryHover hover:underline" onClick={() => loadStats(c.id)}>
                    Показать статистику
                  </button>
                ) : codeStats === "loading" ? (
                  <p className="m-0 mt-1 text-xs text-admin-muted">Загрузка…</p>
                ) : (
                  <p className="m-0 mt-1 text-xs text-admin-muted">
                    {codeStats.ticketCount} билетов · скидок на {codeStats.totalDiscountAmount} BYN · комиссия{" "}
                    {codeStats.totalCommissionAmount} BYN
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <ReferralCodeFormModal
          festivalId={festivalId}
          mode={modal.mode}
          initial={modal.code}
          teachers={teachers}
          schools={schools}
          onClose={() => setModal(null)}
          onSaved={(saved) => {
            setCodes((prev) => (modal.mode === "create" ? [saved, ...prev] : prev.map((c) => (c.id === saved.id ? saved : c))));
            router.refresh();
          }}
        />
      )}

      {confirmingDelete && (
        <ConfirmModal
          title="Удалить реферальный код?"
          message={deleteError ?? `«${confirmingDelete.code}» будет удалён без возможности восстановления.`}
          confirmLabel="Удалить"
          danger
          pending={deleting}
          onConfirm={() => handleDelete(confirmingDelete)}
          onClose={() => {
            setConfirmingDelete(null);
            setDeleteError(null);
          }}
        />
      )}
    </div>
  );
}
