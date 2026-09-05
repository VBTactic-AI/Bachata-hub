"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

// Иконка+цвет — чисто оформительские, привязаны к позиции в списке (у
// DivisionCategory в схеме нет поля "иконка"), не к данным категории. Цикл
// по CYCLE_LEN, чтобы список любой длины не выходил за палитру.
const ICONS = ["👑", "⭐", "❤️", "🚀", "🏆"];
const RING_COLORS = ["bg-night-primary/15", "bg-night-pink/15", "bg-night-violet/15", "bg-red-400/15", "bg-amber-400/15"];

export function CategoryCard({
  categoryId,
  name: initialName,
  order: initialOrder,
  isActive,
  iconIndex,
  compact,
}: {
  categoryId: string;
  name: string;
  order: number;
  isActive: boolean;
  // Позиция в списке — для выбора иконки/цвета по циклу, не индекс среди
  // видимых/скрытых (иначе при переключении видимости иконка "прыгала" бы).
  iconIndex: number;
  // Компактная строка для скрытых категорий (по референсу пользователя,
  // 07.09.2026) вместо квадратной карточки активных.
  compact?: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initialName);
  const [order, setOrder] = useState(String(initialOrder));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const icon = ICONS[iconIndex % ICONS.length];
  const ring = RING_COLORS[iconIndex % RING_COLORS.length];
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
      <div className={compact ? "flex flex-wrap items-center gap-2 rounded-app bg-night-card p-3" : "flex flex-col items-center gap-2 rounded-app bg-night-card p-4"}>
        <Input value={name} onChange={(e) => setName(e.target.value)} className={fieldClass} style={{ maxWidth: 160 }} />
        <Input
          type="number"
          value={order}
          onChange={(e) => setOrder(e.target.value)}
          className={fieldClass}
          style={{ maxWidth: 80 }}
          title="Порядок — чем больше число, тем 'выше' категория"
        />
        <div className="flex gap-1.5">
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
            className="border-night-border bg-transparent text-night-text hover:bg-night-card2"
          >
            Отмена
          </Button>
        </div>
        {error && <span className="w-full text-xs text-red-400">{error}</span>}
      </div>
    );
  }

  if (compact) {
    return (
      <div className="flex items-center gap-3 rounded-app bg-night-card p-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base ${ring}`}>{icon}</span>
        <button type="button" onClick={() => setEditing(true)} className="min-w-0 flex-1 truncate text-left text-sm font-medium text-night-muted">
          {initialName}
        </button>
        <span className="shrink-0 text-xs text-night-muted">{initialOrder}</span>
        <button
          type="button"
          disabled={loading}
          onClick={toggleActive}
          title="Вернуть в список"
          className="shrink-0 rounded-app-sm p-1.5 text-night-muted hover:bg-night-card2 hover:text-night-text"
        >
          👁
        </button>
        <span className="shrink-0 cursor-grab select-none text-night-disabled" aria-hidden="true">
          ⠿
        </span>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col items-center gap-2 rounded-app border border-night-border bg-night-card p-4">
      <span className="absolute right-2 top-2 cursor-grab select-none text-night-disabled" aria-hidden="true">
        ⠿
      </span>
      {isActive && (
        <button
          type="button"
          disabled={loading}
          onClick={toggleActive}
          title="Скрыть"
          className="absolute left-2 top-2 rounded-app-sm p-1 text-night-disabled hover:bg-night-card2 hover:text-night-muted"
        >
          🚫
        </button>
      )}
      <div className="relative mt-1">
        <span className={`flex h-14 w-14 items-center justify-center rounded-full text-2xl ${ring}`}>{icon}</span>
        <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-night-primary text-[0.65rem] font-bold text-white">
          {initialOrder}
        </span>
      </div>
      <button type="button" onClick={() => setEditing(true)} className="text-sm font-semibold text-night-text hover:text-night-primary">
        {initialName}
      </button>
    </div>
  );
}
