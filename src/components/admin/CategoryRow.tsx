"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

// Строка таблицы категорий (по референсу пользователя, 07.09.2026: "список
// с линиями + подсветка" — заменил сетку карточек с иконками). Клик по
// названию — то же инлайн-редактирование, что и раньше.
export function CategoryRow({
  categoryId,
  name: initialName,
  order: initialOrder,
  isActive,
}: {
  categoryId: string;
  name: string;
  order: number;
  isActive: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initialName);
  const [order, setOrder] = useState(String(initialOrder));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const changed = name !== initialName || Number(order) !== initialOrder;

  async function save() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/division-categories/${categoryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, order: Number(order) }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось сохранить изменения.");
      return;
    }
    setEditing(false);
    router.refresh();
  }

  async function toggleActive() {
    setLoading(true);
    await fetch(`/api/division-categories/${categoryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !isActive }),
    });
    setLoading(false);
    router.refresh();
  }

  const fieldClass =
    "!w-auto border-night-border bg-night-card2 py-1 text-sm text-night-text focus:border-night-primary focus:ring-night-primary/20";

  if (editing) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-app-sm bg-night-card2 px-3 py-2.5">
        <Input value={name} onChange={(e) => setName(e.target.value)} className={fieldClass} style={{ maxWidth: 180 }} />
        <Input
          type="number"
          value={order}
          onChange={(e) => setOrder(e.target.value)}
          className={fieldClass}
          style={{ maxWidth: 80 }}
          title="Порядок — чем больше число, тем 'выше' категория"
        />
        {changed && !!name.trim() && (
          <Button type="button" size="sm" disabled={loading} onClick={save} className="border-none bg-gradient-night-cta">
            Сохранить
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={loading}
          onClick={() => setEditing(false)}
          className="border-night-border bg-transparent text-night-text hover:bg-night-card"
        >
          Отмена
        </Button>
        {error && <span className="w-full text-xs text-red-400">{error}</span>}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[32px_1fr_auto] items-center gap-3 rounded-app-sm border-l-4 border-transparent px-3 py-2.5 transition-colors hover:border-night-primary hover:bg-night-card2 sm:grid-cols-[48px_1fr_140px]">
      <span className="text-sm font-semibold text-night-muted">{isActive ? order : ""}</span>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={`min-w-0 truncate text-left text-sm font-medium ${isActive ? "text-night-text" : "text-night-muted"}`}
      >
        {initialName}
      </button>
      <span className="flex items-center justify-end gap-3">
        {isActive ? (
          <>
            <button
              type="button"
              disabled={loading}
              onClick={toggleActive}
              title="Скрыть"
              className="text-night-muted hover:text-night-text"
              aria-label={`Скрыть категорию ${initialName}`}
            >
              👁
            </button>
            <span className="hidden cursor-grab select-none text-night-disabled sm:inline" aria-hidden="true">
              ⠿
            </span>
          </>
        ) : (
          <button
            type="button"
            disabled={loading}
            onClick={toggleActive}
            title="Вернуть в список"
            className="text-xs text-night-disabled hover:text-night-muted hover:underline"
          >
            скрыта
          </button>
        )}
      </span>
    </div>
  );
}
