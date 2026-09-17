"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { BranchFormModal, type BranchFormValue, type CityOption } from "./BranchFormModal";

export function SchoolBranchesManager({
  schoolSlug,
  items,
  cities,
}: {
  schoolSlug: string;
  items: BranchFormValue[];
  cities: CityOption[];
}) {
  const router = useRouter();
  const [modal, setModal] = useState<{ mode: "create" | "edit"; item?: BranchFormValue } | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(id: string, address: string) {
    if (!window.confirm(`Удалить филиал «${address}»?`)) return;
    setLoadingId(id);
    setError(null);
    const res = await fetch(`/api/schools/${schoolSlug}/branches/${id}`, { method: "DELETE" });
    setLoadingId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.message || data.error || "Не удалось удалить филиал.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="rounded-app border border-admin-border bg-admin-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="m-0 text-sm font-semibold uppercase tracking-wide text-admin-muted">Филиалы</h2>
        <Button type="button" variant="adminOutline" size="sm" onClick={() => setModal({ mode: "create" })}>
          + Филиал
        </Button>
      </div>

      {error && <p className="m-0 mt-2 text-xs text-red-400">{error}</p>}

      {items.length === 0 ? (
        <p className="m-0 mt-3 text-sm text-admin-muted">Филиалов пока нет.</p>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {items.map((item) => (
            <div key={item.id} className="rounded-app-sm border border-admin-border px-3 py-2 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="m-0 font-semibold text-night-text">{item.address}</p>
                  <p className="m-0 mt-1 text-xs text-admin-muted">
                    {item.latitude != null && item.longitude != null
                      ? `${item.latitude.toFixed(5)}, ${item.longitude.toFixed(5)}`
                      : "Координаты не указаны — карта на сайте не показывается"}
                  </p>
                </div>
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
                    onClick={() => handleDelete(item.id, item.address)}
                  >
                    Удалить
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <BranchFormModal schoolSlug={schoolSlug} mode={modal.mode} initial={modal.item} cities={cities} onClose={() => setModal(null)} />
      )}
    </div>
  );
}
