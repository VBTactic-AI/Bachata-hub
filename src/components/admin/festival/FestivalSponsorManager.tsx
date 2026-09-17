"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SponsorFormModal, type SponsorFormValue } from "./SponsorFormModal";

export function FestivalSponsorManager({ festivalId, sponsors }: { festivalId: string; sponsors: SponsorFormValue[] }) {
  const router = useRouter();
  const [modal, setModal] = useState<{ mode: "create" | "edit"; sponsor?: SponsorFormValue } | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Удалить спонсора «${name}»?`)) return;
    setLoadingId(id);
    setError(null);
    const res = await fetch(`/api/festivals/${festivalId}/sponsors/${id}`, { method: "DELETE" });
    setLoadingId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.message || data.error || "Не удалось удалить спонсора.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="rounded-app border border-admin-border bg-admin-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="m-0 text-sm font-semibold uppercase tracking-wide text-admin-muted">Спонсоры</h2>
        <Button type="button" variant="adminOutline" size="sm" onClick={() => setModal({ mode: "create" })}>
          + Спонсор
        </Button>
      </div>

      {error && <p className="m-0 mt-2 text-xs text-red-400">{error}</p>}

      {sponsors.length === 0 ? (
        <p className="m-0 mt-3 text-sm text-admin-muted">Спонсоров пока нет.</p>
      ) : (
        <div className="mt-3 flex flex-col gap-1.5">
          {sponsors.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-app-sm border border-admin-border px-3 py-2 text-sm">
              <span className="font-semibold text-night-text">{s.name}</span>
              <span className="text-admin-muted">{s.tier}</span>
              {s.amount != null && (
                <span className="text-admin-muted">
                  {s.amount} {s.currency ?? ""}
                </span>
              )}
              <div className="ml-auto flex gap-2">
                <button
                  type="button"
                  className="text-xs text-admin-muted hover:text-night-text hover:underline"
                  onClick={() => setModal({ mode: "edit", sponsor: s })}
                >
                  Изменить
                </button>
                <button
                  type="button"
                  disabled={loadingId === s.id}
                  className="text-xs text-admin-muted hover:text-red-400 hover:underline"
                  onClick={() => handleDelete(s.id, s.name)}
                >
                  Удалить
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <SponsorFormModal festivalId={festivalId} mode={modal.mode} initial={modal.sponsor} onClose={() => setModal(null)} />
      )}
    </div>
  );
}
