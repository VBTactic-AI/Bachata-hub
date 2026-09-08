"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { StatusBadge } from "@/components/admin/StatusBadge";

type Category = { id: string; name: string; order: number };

function PencilIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function KebabIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="5" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="12" cy="19" r="1.6" />
    </svg>
  );
}

// Активные категории — порядок задаётся перетаскиванием (по запросу
// пользователя, 07.09.2026: "менять местами, приоритет вручную вводить не
// надо"). Pointer Events вместо HTML5 drag-and-drop — работает одинаково
// мышью и тачем, без сторонней библиотеки (CLAUDE.md §14 — не добавлять
// зависимости без необходимости). Порядок при отпускании пересчитывается
// как позиция в списке (1..N) и сохраняется только для реально изменившихся
// категорий — не переписываем весь справочник ради одной перестановки.
// Таблица (redesign, 2026-09-09) — тот же визуальный язык, что и на
// вкладках "Этапы отбора"/"Оценочные показатели": StatusBadge, карандаш,
// редактирование по клику на строку И по карандашу.
export function CategoryList({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const [items, setItems] = useState(categories);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());

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
    "!w-auto border-admin-border bg-admin-card2 py-1 text-sm text-night-text focus:border-admin-primary focus:ring-admin-primary/20";

  return (
    <>
      {error && (
        <tr>
          <td colSpan={4} className="px-3 py-1 text-xs text-red-400">
            {error}
          </td>
        </tr>
      )}
      {items.map((c, i) =>
        editingId === c.id ? (
          <tr key={c.id} className="border-t border-admin-border bg-admin-card2/40">
            <td className="px-3 py-2 align-middle text-sm font-semibold text-admin-muted">{i + 1}</td>
            <td className="px-3 py-2 align-middle">
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} className={fieldClass} style={{ maxWidth: 180 }} autoFocus />
            </td>
            <td className="px-3 py-2 align-middle" colSpan={2}>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {editName.trim() && editName !== c.name && (
                  <Button type="button" size="sm" variant="admin" onClick={() => saveName(c.id)}>
                    Сохранить
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
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
            key={c.id}
            ref={(el) => {
              if (el) rowRefs.current.set(c.id, el);
              else rowRefs.current.delete(c.id);
            }}
            onClick={() => {
              setEditingId(c.id);
              setEditName(c.name);
            }}
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
            <td className="px-3 py-2.5 align-middle">
              <StatusBadge label="Активна" variant="success" />
            </td>
            <td className="px-3 py-2.5 align-middle" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(c.id);
                    setEditName(c.name);
                  }}
                  title="Редактировать"
                  aria-label={`Редактировать категорию ${c.name}`}
                  className="text-admin-muted hover:text-night-text"
                >
                  <PencilIcon />
                </button>
                <button type="button" onClick={() => hide(c.id)} title="Скрыть" aria-label={`Скрыть категорию ${c.name}`} className="text-admin-muted hover:text-night-text">
                  <KebabIcon />
                </button>
                <button
                  type="button"
                  onPointerDown={(e) => onHandlePointerDown(c.id, e)}
                  onPointerMove={onHandlePointerMove}
                  onPointerUp={onHandlePointerUp}
                  onPointerCancel={onHandlePointerUp}
                  aria-label={`Перетащить, чтобы изменить порядок категории ${c.name}`}
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
