"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { PencilIcon, KebabIcon } from "@/components/admin/icons";
import { DeleteIconButton } from "@/components/admin/DeleteIconButton";

type Stage = { id: string; name: string; defaultAdvanceCount: number; order: number };

// Активные этапы — таблица строк <tr>/<td> (redesign, 2026-09-09, тот же
// визуальный язык, что и на вкладках "Категории"/"Оценочные показатели") с
// перетаскиванием для смены порядка (Pointer Events, как в CategoryList.tsx —
// раньше у этапов отбора такой возможности не было вообще, только у
// категорий; добавлено по прямому запросу пользователя вместе с
// order в updateRoundStageSchema/updateRoundStage). Редактирование — по
// клику на строку И по карандашу одновременно.
export function RoundStageList({ stages }: { stages: Stage[] }) {
  const router = useRouter();
  const [items, setItems] = useState(stages);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ name: string; defaultAdvanceCount: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());

  useEffect(() => {
    setItems(stages);
  }, [stages]);

  function reorderOver(overId: string) {
    setItems((prev) => {
      if (!draggingId || draggingId === overId) return prev;
      const from = prev.findIndex((s) => s.id === draggingId);
      const to = prev.findIndex((s) => s.id === overId);
      if (from === -1 || to === -1) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  function onHandlePointerDown(id: string, e: React.PointerEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDraggingId(id);
  }

  function onHandlePointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (!draggingId) return;
    for (const [id, el] of rowRefs.current) {
      const rect = el.getBoundingClientRect();
      if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
        reorderOver(id);
        break;
      }
    }
  }

  async function onHandlePointerUp() {
    if (!draggingId) return;
    setDraggingId(null);
    const changed = items.map((s, i) => ({ id: s.id, newOrder: i + 1, changed: s.order !== i + 1 })).filter((s) => s.changed);
    if (changed.length === 0) return;
    setError(null);
    try {
      const results = await Promise.all(
        changed.map((s) =>
          fetch(`/api/round-stages/${s.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ order: s.newOrder }),
          })
        )
      );
      if (results.some((r) => !r.ok)) setError("Не удалось сохранить новый порядок для всех этапов.");
    } catch {
      setError("Не удалось сохранить новый порядок — проверьте соединение.");
    }
    router.refresh();
  }

  async function hide(id: string) {
    await fetch(`/api/round-stages/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: false }),
    });
    setItems((prev) => prev.filter((s) => s.id !== id));
    router.refresh();
  }

  function startEdit(s: Stage) {
    setEditingId(s.id);
    setDraft({ name: s.name, defaultAdvanceCount: String(s.defaultAdvanceCount) });
    setError(null);
  }

  async function save(id: string) {
    if (!draft) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/round-stages/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: draft.name, defaultAdvanceCount: Number(draft.defaultAdvanceCount) }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось сохранить изменения.");
      return;
    }
    setEditingId(null);
    router.refresh();
  }

  const fieldClass =
    "!w-auto border-admin-border bg-admin-card2 py-1 text-sm text-night-text focus:border-admin-primary focus:ring-admin-primary/20";

  return (
    <>
      {error && (
        <tr>
          <td colSpan={5} className="px-3 py-1 text-xs text-red-400">
            {error}
          </td>
        </tr>
      )}
      {items.map((s, i) =>
        editingId === s.id && draft ? (
          <tr key={s.id} className="border-t border-admin-border bg-admin-card2/40">
            <td className="px-3 py-2 align-middle text-sm font-semibold text-admin-muted">{i + 1}</td>
            <td className="px-3 py-2 align-middle" colSpan={2}>
              <div className="flex flex-wrap items-center gap-2">
                <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={fieldClass} style={{ maxWidth: 180 }} autoFocus />
                <Input
                  type="number"
                  min={1}
                  value={draft.defaultAdvanceCount}
                  onChange={(e) => setDraft({ ...draft, defaultAdvanceCount: e.target.value })}
                  className={fieldClass}
                  style={{ maxWidth: 90 }}
                />
              </div>
            </td>
            <td className="px-3 py-2 align-middle" colSpan={2}>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="admin"
                  disabled={loading || !draft.name.trim() || !draft.defaultAdvanceCount}
                  onClick={() => save(s.id)}
                >
                  Сохранить
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={loading}
                  onClick={() => setEditingId(null)}
                  className="border-admin-border bg-transparent text-night-text hover:bg-admin-card"
                >
                  Отмена
                </Button>
              </div>
            </td>
          </tr>
        ) : (
          <tr
            key={s.id}
            ref={(el) => {
              if (el) rowRefs.current.set(s.id, el);
              else rowRefs.current.delete(s.id);
            }}
            onClick={() => startEdit(s)}
            className={`cursor-pointer border-t border-admin-border transition-colors ${
              draggingId === s.id ? "bg-admin-card2/70" : "hover:bg-admin-card2/50"
            }`}
          >
            <td className="px-3 py-2.5 align-middle">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-app-sm bg-admin-card2 text-xs font-semibold text-admin-muted">
                {i + 1}
              </span>
            </td>
            <td className="px-3 py-2.5 align-middle text-sm font-medium text-night-text">{s.name}</td>
            <td className="px-3 py-2.5 align-middle text-sm text-admin-muted">{s.defaultAdvanceCount}</td>
            <td className="px-3 py-2.5 align-middle">
              <StatusBadge label="Активна" variant="success" />
            </td>
            <td className="px-3 py-2.5 align-middle" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-end gap-3">
                <button type="button" onClick={() => startEdit(s)} title="Редактировать" aria-label={`Редактировать этап ${s.name}`} className="text-admin-muted hover:text-night-text">
                  <PencilIcon />
                </button>
                <button type="button" onClick={() => hide(s.id)} title="Скрыть" aria-label={`Скрыть этап ${s.name}`} className="text-admin-muted hover:text-night-text">
                  <KebabIcon />
                </button>
                <DeleteIconButton
                  url={`/api/round-stages/${s.id}`}
                  confirmMessage={`Удалить этап «${s.name}»? Это необратимо.`}
                  label={`Удалить этап ${s.name}`}
                />
                <button
                  type="button"
                  onPointerDown={(e) => onHandlePointerDown(s.id, e)}
                  onPointerMove={onHandlePointerMove}
                  onPointerUp={onHandlePointerUp}
                  onPointerCancel={onHandlePointerUp}
                  aria-label={`Перетащить, чтобы изменить порядок этапа ${s.name}`}
                  className="hidden touch-none cursor-grab select-none border-none bg-transparent p-1 text-admin-disabled hover:text-admin-muted active:cursor-grabbing sm:inline-flex"
                >
                  ⠿
                </button>
              </div>
            </td>
          </tr>
        )
      )}
    </>
  );
}
