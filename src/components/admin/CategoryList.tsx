"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

type Category = { id: string; name: string; order: number };

// Активные категории — порядок задаётся перетаскиванием (по запросу
// пользователя, 07.09.2026: "менять местами, приоритет вручную вводить не
// надо"). Pointer Events вместо HTML5 drag-and-drop — работает одинаково
// мышью и тачем, без сторонней библиотеки (CLAUDE.md §14 — не добавлять
// зависимости без необходимости). Порядок при отпускании пересчитывается
// как позиция в списке (1..N) и сохраняется только для реально изменившихся
// категорий — не переписываем весь справочник ради одной перестановки.
export function CategoryList({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const [items, setItems] = useState(categories);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());

  useEffect(() => {
    setItems(categories);
  }, [categories]);

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
          fetch(`/api/division-categories/${c.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ order: c.newOrder }),
          })
        )
      );
      if (results.some((r) => !r.ok)) {
        setError("Не удалось сохранить новый порядок для всех категорий.");
      }
    } catch {
      setError("Не удалось сохранить новый порядок — проверьте соединение.");
    }
    router.refresh();
  }

  async function hide(id: string) {
    await fetch(`/api/division-categories/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: false }),
    });
    setItems((prev) => prev.filter((c) => c.id !== id));
    router.refresh();
  }

  async function saveName(id: string) {
    const res = await fetch(`/api/division-categories/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName }),
    });
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
        editingId === c.id ? (
          <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-app-sm bg-night-card2 px-3 py-2.5">
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} className={fieldClass} style={{ maxWidth: 180 }} autoFocus />
            {editName.trim() && editName !== c.name && (
              <Button type="button" size="sm" onClick={() => saveName(c.id)} className="border-none bg-gradient-night-cta">
                Сохранить
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setEditingId(null)}
              className="border-night-border bg-transparent text-night-text hover:bg-night-card"
            >
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
              draggingId === c.id ? "border-night-primary bg-night-card2 opacity-70" : "border-transparent hover:border-night-primary hover:bg-night-card2"
            }`}
          >
            <span className="text-sm font-semibold text-night-muted">{i + 1}</span>
            <button
              type="button"
              onClick={() => {
                setEditingId(c.id);
                setEditName(c.name);
              }}
              className="min-w-0 truncate text-left text-sm font-medium text-night-text"
            >
              {c.name}
            </button>
            <span className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => hide(c.id)}
                title="Скрыть"
                className="text-night-muted hover:text-night-text"
                aria-label={`Скрыть категорию ${c.name}`}
              >
                👁
              </button>
              <button
                type="button"
                onPointerDown={(e) => onHandlePointerDown(c.id, e)}
                onPointerMove={onHandlePointerMove}
                onPointerUp={onHandlePointerUp}
                onPointerCancel={onHandlePointerUp}
                aria-label={`Перетащить, чтобы изменить порядок категории ${c.name}`}
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
