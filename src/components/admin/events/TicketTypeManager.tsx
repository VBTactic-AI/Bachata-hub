"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge, type StatusBadgeVariant } from "@/components/admin/StatusBadge";
import { Button } from "@/components/ui/button";
import { TicketTypeFormModal, type TicketTypeFormValue } from "./TicketTypeFormModal";

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Черновик",
  ACTIVE: "Активен",
  PAUSED: "На паузе",
  SOLD_OUT: "Распродан",
  ENDED: "Завершён",
  ARCHIVED: "Закрыт",
};

const STATUS_VARIANTS: Record<string, StatusBadgeVariant> = {
  DRAFT: "neutral",
  ACTIVE: "success",
  PAUSED: "warning",
  SOLD_OUT: "danger",
  ENDED: "neutral",
  ARCHIVED: "neutral",
};

export type TicketTypeRow = TicketTypeFormValue & {
  status: string;
  soldQuantity: number;
  availableQuantity: number | null;
};

// Управление TicketType события (2026-09-16, Ticket Engine v2) —
// упрощённый аналог PassManager.tsx: без шаблонов и доступа к программе
// (билет на одно событие целиком, см. комментарий у модели TicketType).
export function TicketTypeManager({
  eventSlug,
  registrationsPath,
  ticketTypes,
}: {
  eventSlug: string;
  registrationsPath: string;
  ticketTypes: TicketTypeRow[];
}) {
  const router = useRouter();
  const [modal, setModal] = useState<{ mode: "create" | "edit"; tt?: TicketTypeRow } | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function setStatus(id: string, status: string) {
    setLoadingId(id);
    setError(null);
    const res = await fetch(`/api/events/${eventSlug}/ticket-types/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setLoadingId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.message || data.error || "Не удалось изменить статус.");
      return;
    }
    router.refresh();
  }

  async function deleteTicketTypePermanently(id: string, name: string) {
    if (!window.confirm(`Удалить билет «${name}» безвозвратно? Это действие нельзя отменить.`)) return;
    setLoadingId(id);
    setError(null);
    const res = await fetch(`/api/events/${eventSlug}/ticket-types/${id}`, { method: "DELETE" });
    setLoadingId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.message || data.error || "Не удалось удалить билет.");
      return;
    }
    router.refresh();
  }

  const ACTION_CLASS = "text-xs text-admin-muted hover:text-night-text hover:underline disabled:cursor-not-allowed disabled:opacity-50";

  function statusActionLabel(tt: TicketTypeRow): { label: string; next: string } | null {
    if (tt.status === "PAUSED" || tt.status === "DRAFT") return { label: "Активировать", next: "ACTIVE" };
    if (tt.status === "ACTIVE") return { label: "Пауза", next: "PAUSED" };
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="m-0 text-sm text-admin-muted">{ticketTypes.length} билетов для этого события.</p>
        <Button type="button" variant="admin" size="sm" onClick={() => setModal({ mode: "create" })}>
          + Добавить билет
        </Button>
      </div>

      {error && <p className="m-0 text-sm text-red-400">{error}</p>}

      {ticketTypes.length === 0 ? (
        <p className="text-sm text-admin-muted">Билеты для этого события ещё не созданы.</p>
      ) : (
        <div className="overflow-x-auto rounded-app border border-admin-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-admin-card2 text-xs font-semibold uppercase tracking-wide text-admin-disabled">
              <tr>
                <th className="px-3 py-2 font-semibold">Билет</th>
                <th className="px-3 py-2 text-right font-semibold">Цена</th>
                <th className="px-3 py-2 font-semibold">Продано / Доступно</th>
                <th className="px-3 py-2 font-semibold">Статус</th>
                <th className="px-3 py-2 text-right font-semibold">Действия</th>
              </tr>
            </thead>
            <tbody>
              {ticketTypes.map((tt) => (
                <tr key={tt.id} className="border-t border-admin-border hover:bg-admin-card2/50">
                  <td className="px-3 py-2 align-top font-medium text-night-text">{tt.name}</td>
                  <td className="px-3 py-2 align-top text-right tabular-nums text-night-text">
                    {tt.price == null ? "Бесплатно" : `${tt.price} ${tt.currency ?? ""}`}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <a href={`${registrationsPath}`} className="text-sm text-admin-primaryHover hover:underline">
                      {tt.soldQuantity} / {tt.availableQuantity == null ? "∞" : tt.soldQuantity + tt.availableQuantity}
                    </a>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <StatusBadge label={STATUS_LABELS[tt.status] ?? tt.status} variant={STATUS_VARIANTS[tt.status] ?? "neutral"} />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div className="flex flex-wrap justify-end gap-2">
                      <button type="button" className={ACTION_CLASS} onClick={() => setModal({ mode: "edit", tt })}>
                        Изменить
                      </button>
                      {statusActionLabel(tt) && (
                        <button
                          type="button"
                          disabled={loadingId === tt.id}
                          className={ACTION_CLASS}
                          onClick={() => setStatus(tt.id, statusActionLabel(tt)!.next)}
                        >
                          {statusActionLabel(tt)!.label}
                        </button>
                      )}
                      {tt.status !== "ARCHIVED" && (
                        <button
                          type="button"
                          disabled={loadingId === tt.id}
                          className={`${ACTION_CLASS} hover:text-red-400`}
                          onClick={() => setStatus(tt.id, "ARCHIVED")}
                        >
                          Закрыть
                        </button>
                      )}
                      {tt.soldQuantity === 0 && (
                        <button
                          type="button"
                          disabled={loadingId === tt.id}
                          className={`${ACTION_CLASS} hover:text-red-400`}
                          onClick={() => deleteTicketTypePermanently(tt.id, tt.name)}
                        >
                          Удалить
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && <TicketTypeFormModal eventSlug={eventSlug} mode={modal.mode} initial={modal.tt} onClose={() => setModal(null)} />}
    </div>
  );
}
