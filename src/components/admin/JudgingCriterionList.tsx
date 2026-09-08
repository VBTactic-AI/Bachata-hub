"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

type Criterion = { id: string; name: string; minScore: number; maxScore: number; step: number; order: number };

// Активные критерии справочника — тот же паттерн drag-reorder, что и
// CategoryList.tsx (Pointer Events, порядок пересчитывается как позиция
// 1..N при отпускании), плюс инлайн-редактирование диапазона/шага — которых
// у категорий нет, но у критерия оценки это основные значения, не только
// название.
export function JudgingCriterionList({ criteria }: { criteria: Criterion[] }) {
  const router = useRouter();
  const [items, setItems] = useState(criteria);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ name: string; minScore: number; maxScore: number; step: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());

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
    "!w-auto border-night-border bg-night-card2 py-1 text-sm text-night-text focus:border-night-primary focus:ring-night-primary/20";

  return (
    <div className="flex flex-col gap-0.5">
      {error && <p className="m-0 mb-1 text-xs text-red-400">{error}</p>}
      {items.map((c, i) =>
        editingId === c.id && draft ? (
          <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-app-sm bg-night-card2 px-3 py-2.5">
            <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={fieldClass} style={{ maxWidth: 180 }} autoFocus />
            <span className="text-xs text-night-muted">от</span>
            <Input type="number" value={draft.minScore} onChange={(e) => setDraft({ ...draft, minScore: Number(e.target.value) })} className={fieldClass} style={{ maxWidth: 70 }} />
            <span className="text-xs text-night-muted">до</span>
            <Input type="number" value={draft.maxScore} onChange={(e) => setDraft({ ...draft, maxScore: Number(e.target.value) })} className={fieldClass} style={{ maxWidth: 70 }} />
            <span className="text-xs text-night-muted">шаг</span>
            <Input type="number" min={1} value={draft.step} onChange={(e) => setDraft({ ...draft, step: Number(e.target.value) })} className={fieldClass} style={{ maxWidth: 70 }} />
            <Button type="button" size="sm" disabled={loading || !draft.name.trim() || draft.maxScore <= draft.minScore} onClick={() => save(c.id)} className="border-none bg-gradient-admin-cta">
              Сохранить
            </Button>
            <Button type="button" size="sm" variant="secondary" disabled={loading} onClick={() => setEditingId(null)} className="border-night-border bg-transparent text-night-text hover:bg-night-card">
              Отмена
            </Button>
          </div>
        ) : (
          <div
            key={c.id}
            ref={(el) => {
              if (el) rowRefs.current.set(c.id, el);
              else rowRefs.current.delete(c.id);
            }}
            className={`grid grid-cols-[32px_1fr_auto] items-center gap-3 rounded-app-sm border-l-4 px-3 py-2.5 transition-colors sm:grid-cols-[48px_1fr_140px] ${
              draggingId === c.id ? "border-admin-primary bg-night-card2 opacity-70" : "border-transparent hover:border-admin-primary hover:bg-night-card2"
            }`}
          >
            <span className="text-sm font-semibold text-night-muted">{i + 1}</span>
            <button type="button" onClick={() => startEdit(c)} className="min-w-0 truncate text-left text-sm font-medium text-night-text">
              {c.name} <span className="text-night-muted font-normal">({c.minScore}–{c.maxScore})</span>
            </button>
            <span className="flex items-center justify-end gap-3">
              <button type="button" onClick={() => hide(c.id)} title="Скрыть" className="text-night-muted hover:text-night-text" aria-label={`Скрыть критерий ${c.name}`}>
                👁
              </button>
              <button
                type="button"
                onPointerDown={(e) => onHandlePointerDown(c.id, e)}
                onPointerMove={onHandlePointerMove}
                onPointerUp={onHandlePointerUp}
                onPointerCancel={onHandlePointerUp}
                aria-label={`Перетащить, чтобы изменить порядок критерия ${c.name}`}
                className="touch-none cursor-grab select-none border-none bg-transparent p-1 text-night-disabled hover:text-night-muted active:cursor-grabbing"
              >
                ⠿
              </button>
            </span>
          </div>
        )
      )}
    </div>
  );
}
