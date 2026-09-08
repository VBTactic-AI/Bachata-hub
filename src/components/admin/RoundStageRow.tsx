"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { StatusBadge } from "@/components/admin/StatusBadge";

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

// Строка таблицы этапов отбора (redesign, 2026-09-09 — приведено к стилю
// UI-референса пользователя: настоящая <tr>/<td> строка вместо CSS-grid,
// StatusBadge вместо текстовой подписи, карандаш/кебаб вместо эмодзи. Те же
// самые действия, что и раньше: карандаш — переименовать/поменять число
// (было по клику на само название), кебаб — скрыть/вернуть (было 👁), ⠿ —
// перетащить для смены порядка (не показано в референсе, но без этого
// исчезла бы работающая функция ручной сортировки этапов).
export function RoundStageRow({
  stageId,
  name: initialName,
  defaultAdvanceCount: initialCount,
  isActive,
  order,
}: {
  stageId: string;
  name: string;
  defaultAdvanceCount: number;
  isActive: boolean;
  order: number | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initialName);
  const [count, setCount] = useState(String(initialCount));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const changed = name !== initialName || Number(count) !== initialCount;

  async function save() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/round-stages/${stageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, defaultAdvanceCount: Number(count) }),
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
    await fetch(`/api/round-stages/${stageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !isActive }),
    });
    setLoading(false);
    router.refresh();
  }

  const fieldClass =
    "!w-auto border-admin-border bg-admin-card2 py-1 text-sm text-night-text focus:border-admin-primary focus:ring-admin-primary/20";

  if (editing) {
    return (
      <tr className="border-t border-admin-border bg-admin-card2/40">
        <td className="px-3 py-2 align-middle text-sm font-semibold text-admin-muted">{order ?? ""}</td>
        <td className="px-3 py-2 align-middle" colSpan={2}>
          <div className="flex flex-wrap items-center gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} className={fieldClass} style={{ maxWidth: 180 }} autoFocus />
            <Input type="number" min={1} value={count} onChange={(e) => setCount(e.target.value)} className={fieldClass} style={{ maxWidth: 90 }} />
          </div>
          {error && <p className="m-0 mt-1 text-xs text-red-400">{error}</p>}
        </td>
        <td className="px-3 py-2 align-middle" colSpan={2}>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {changed && !!name.trim() && (
              <Button type="button" size="sm" variant="admin" disabled={loading} onClick={save}>
                Сохранить
              </Button>
            )}
            <Button type="button" size="sm" variant="secondary" disabled={loading} onClick={() => setEditing(false)} className="border-admin-border bg-transparent text-night-text hover:bg-admin-card">
              Отмена
            </Button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-t border-admin-border transition-colors hover:bg-admin-card2/50">
      <td className="px-3 py-2.5 align-middle">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-app-sm bg-admin-card2 text-xs font-semibold text-admin-muted">
          {order ?? "—"}
        </span>
      </td>
      <td className={`px-3 py-2.5 align-middle text-sm font-medium ${isActive ? "text-night-text" : "text-admin-muted"}`}>{initialName}</td>
      <td className="px-3 py-2.5 align-middle text-sm text-admin-muted">{initialCount}</td>
      <td className="px-3 py-2.5 align-middle">
        <StatusBadge label={isActive ? "Активна" : "Скрыта"} variant={isActive ? "success" : "neutral"} />
      </td>
      <td className="px-3 py-2.5 align-middle">
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => setEditing(true)}
            title="Редактировать"
            aria-label={`Редактировать этап ${initialName}`}
            className="text-admin-muted hover:text-night-text"
          >
            <PencilIcon />
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={toggleActive}
            title={isActive ? "Скрыть" : "Вернуть в список"}
            aria-label={isActive ? `Скрыть этап ${initialName}` : `Вернуть этап ${initialName} в список`}
            className="text-admin-muted hover:text-night-text"
          >
            <KebabIcon />
          </button>
          {isActive && (
            <span className="hidden cursor-grab select-none text-admin-disabled sm:inline" aria-hidden="true">
              ⠿
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}
