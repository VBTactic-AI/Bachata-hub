"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { PencilIcon, KebabIcon } from "@/components/admin/icons";
import { DeleteIconButton } from "@/components/admin/DeleteIconButton";

type Criterion = { id: string; name: string; minScore: number; maxScore: number; step: number; order: number };

// Активные критерии справочника — тот же паттерн drag-reorder, что и
// CategoryList.tsx (Pointer Events, порядок пересчитывается как позиция
// 1..N при отпускании), плюс инлайн-редактирование диапазона/шага — которых
// у категорий нет, но у критерия оценки это основные значения, не только
// название. Таблица (redesign, 2026-09-09) — тот же визуальный язык, что и
// на вкладке "Этапы отбора": название и диапазон — отдельные столбцы (были
// склеены в один), редактирование — по клику на строку И по карандашу.
export function JudgingCriterionList({ criteria }: { criteria: Criterion[] }) {
  const router = useRouter();
  const [items, setItems] = useState(criteria);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ name: string; minScore: number; maxScore: number; step: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());

  useEffect(() => {
    setItems(criteria);
  }, [criteria]);

  function reorderOver(overId: string) {
    setItems((prev) => {
      if (!draggingId || draggingId === overId) return prev;
      const from = prev.findIndex((c) => c.id === draggingId);
      const to = prev.findIndex((c) => c.id === overId);
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
    const changed = items.map((c, i) => ({ id: c.id, newOrder: i + 1, changed: c.order !== i + 1 })).filter((c) => c.changed);
    if (changed.length === 0) return;
    setError(null);
    try {
      const results = await Promise.all(
        changed.map((c) =>
          fetch(`/api/judging-criteria/${c.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ order: c.newOrder }),
          })
        )
      );
      if (results.some((r) => !r.ok)) setError("Не удалось сохранить новый порядок для всех критериев.");
    } catch {
      setError("Не удалось сохранить новый порядок — проверьте соединение.");
    }
    router.refresh();
  }

  async function hide(id: string) {
    await fetch(`/api/judging-criteria/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: false }),
    });
    setItems((prev) => prev.filter((c) => c.id !== id));
    router.refresh();
  }

  function startEdit(c: Criterion) {
    setEditingId(c.id);
    setDraft({ name: c.name, minScore: c.minScore, maxScore: c.maxScore, step: c.step });
    setError(null);
  }

  async function save(id: string) {
    if (!draft) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/judging-criteria/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
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
      {items.map((c, i) =>
        editingId === c.id && draft ? (
          <tr key={c.id} className="border-t border-admin-border bg-admin-card2/40">
            <td className="px-3 py-2 align-middle text-sm font-semibold text-admin-muted">{i + 1}</td>
            <td className="px-3 py-2 align-middle">
              <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={fieldClass} style={{ maxWidth: 180 }} autoFocus />
            </td>
            <td className="px-3 py-2 align-middle">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-admin-muted">от</span>
                <Input type="number" value={draft.minScore} onChange={(e) => setDraft({ ...draft, minScore: Number(e.target.value) })} className={fieldClass} style={{ maxWidth: 70 }} />
                <span className="text-xs text-admin-muted">до</span>
                <Input type="number" value={draft.maxScore} onChange={(e) => setDraft({ ...draft, maxScore: Number(e.target.value) })} className={fieldClass} style={{ maxWidth: 70 }} />
                <span className="text-xs text-admin-muted">шаг</span>
                <Input type="number" min={1} value={draft.step} onChange={(e) => setDraft({ ...draft, step: Number(e.target.value) })} className={fieldClass} style={{ maxWidth: 70 }} />
              </div>
            </td>
            <td className="px-3 py-2 align-middle" colSpan={2}>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button type="button" size="sm" variant="admin" disabled={loading || !draft.name.trim() || draft.maxScore <= draft.minScore} onClick={() => save(c.id)}>
                  Сохранить
                </Button>
                <Button type="button" size="sm" variant="secondary" disabled={loading} onClick={() => setEditingId(null)} className="border-admin-border bg-transparent text-night-text hover:bg-admin-card">
                  Отмена
                </Button>
              </div>
            </td>
          </tr>
        ) : (
          <tr
            key={c.id}
            ref={(el) => {
              if (el) rowRefs.current.set(c.id, el);
              else rowRefs.current.delete(c.id);
            }}
            onClick={() => startEdit(c)}
            className={`cursor-pointer border-t border-admin-border transition-colors ${
              draggingId === c.id ? "bg-admin-card2/70" : "hover:bg-admin-card2/50"
            }`}
          >
            <td className="px-3 py-2.5 align-middle">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-app-sm bg-admin-card2 text-xs font-semibold text-admin-muted">
                {i + 1}
              </span>
            </td>
            <td className="px-3 py-2.5 align-middle text-sm font-medium text-night-text">{c.name}</td>
            <td className="px-3 py-2.5 align-middle text-sm text-admin-muted">
              {c.minScore}–{c.maxScore}
            </td>
            <td className="px-3 py-2.5 align-middle">
              <StatusBadge label="Активен" variant="success" />
            </td>
            <td className="px-3 py-2.5 align-middle" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-end gap-3">
                <button type="button" onClick={() => startEdit(c)} title="Редактировать" aria-label={`Редактировать критерий ${c.name}`} className="text-admin-muted hover:text-night-text">
                  <PencilIcon />
                </button>
                <button type="button" onClick={() => hide(c.id)} title="Скрыть" aria-label={`Скрыть критерий ${c.name}`} className="text-admin-muted hover:text-night-text">
                  <KebabIcon />
                </button>
                <DeleteIconButton
                  url={`/api/judging-criteria/${c.id}`}
                  confirmMessage={`Удалить показатель «${c.name}»? Это необратимо.`}
                  label={`Удалить показатель ${c.name}`}
                />
                <button
                  type="button"
                  onPointerDown={(e) => onHandlePointerDown(c.id, e)}
                  onPointerMove={onHandlePointerMove}
                  onPointerUp={onHandlePointerUp}
                  onPointerCancel={onHandlePointerUp}
                  aria-label={`Перетащить, чтобы изменить порядок критерия ${c.name}`}
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
