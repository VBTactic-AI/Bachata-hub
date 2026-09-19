"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/admin/ConfirmModal";
import { PencilIcon, TrashIcon } from "@/components/admin/icons";
import { SponsorFormModal, type SponsorFormValue } from "./SponsorFormModal";

// Карточная сетка вместо плоского списка (перенос UI-прототипа Festival
// Engine, Stage R7, 2026-09-19) — логотип (если загружен) или эмодзи-
// плейсхолдер, бейдж уровня спонсорства внизу карточки. Удаление — через
// ConfirmModal вместо window.confirm (единый модальный паттерн проекта).
export function FestivalSponsorManager({ festivalId, sponsors }: { festivalId: string; sponsors: SponsorFormValue[] }) {
  const router = useRouter();
  const [modal, setModal] = useState<{ mode: "create" | "edit"; sponsor?: SponsorFormValue } | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<SponsorFormValue | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(sponsor: SponsorFormValue) {
    setLoadingId(sponsor.id);
    setError(null);
    const res = await fetch(`/api/festivals/${festivalId}/sponsors/${sponsor.id}`, { method: "DELETE" });
    setLoadingId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.message || data.error || "Не удалось удалить спонсора.");
      return;
    }
    setConfirmingDelete(null);
    router.refresh();
  }

  return (
    <div className="rounded-app border border-admin-border bg-admin-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="m-0 text-sm font-semibold uppercase tracking-wide text-admin-muted">Спонсоры</h2>
        <Button type="button" variant="adminOutline" size="sm" onClick={() => setModal({ mode: "create" })}>
          Спонсор
        </Button>
      </div>

      {error && <p className="m-0 mt-2 text-xs text-red-400">{error}</p>}

      {sponsors.length === 0 ? (
        <p className="m-0 mt-3 text-sm text-admin-muted">Спонсоров пока нет.</p>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {sponsors.map((s) => (
            <div key={s.id} className="flex flex-col overflow-hidden rounded-app border border-admin-border">
              <div className="relative flex h-16 shrink-0 items-center justify-center overflow-hidden bg-gradient-to-br from-[#1d2b52] to-[#2a1a44] text-2xl">
                {s.logoUrl ? (
                  // Небольшая фиксированная миниатюра карточки — plain <img>, как и в остальных списках админки.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.logoUrl} alt="" className="h-full w-full object-contain bg-white/5 p-1.5" />
                ) : (
                  <span aria-hidden="true">🤝</span>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-1 p-2.5">
                <span className="truncate text-sm font-semibold text-night-text">{s.name}</span>
                <span className="w-fit rounded-full bg-admin-card2 px-2 py-0.5 text-[10px] font-bold text-admin-muted">{s.tier}</span>
                {s.amount != null && (
                  <span className="text-xs text-admin-muted">
                    {s.amount} {s.currency ?? ""}
                  </span>
                )}
                <div className="mt-auto flex justify-end gap-1 pt-1.5">
                  <button
                    type="button"
                    title="Изменить"
                    aria-label="Изменить спонсора"
                    onClick={() => setModal({ mode: "edit", sponsor: s })}
                    className="inline-flex items-center justify-center rounded-app-sm p-1.5 text-admin-muted hover:bg-admin-card2 hover:text-night-text"
                  >
                    <PencilIcon />
                  </button>
                  <button
                    type="button"
                    title="Удалить"
                    aria-label="Удалить спонсора"
                    disabled={loadingId === s.id}
                    onClick={() => setConfirmingDelete(s)}
                    className="inline-flex items-center justify-center rounded-app-sm p-1.5 text-admin-muted hover:bg-red-400/10 hover:text-red-400 disabled:opacity-50"
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && <SponsorFormModal festivalId={festivalId} mode={modal.mode} initial={modal.sponsor} onClose={() => setModal(null)} />}

      {confirmingDelete && (
        <ConfirmModal
          title="Удалить спонсора?"
          message={`«${confirmingDelete.name}» будет удалён из списка спонсоров фестиваля.`}
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
