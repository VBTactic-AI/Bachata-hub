"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { PencilIcon } from "@/components/admin/icons";
import { DeleteIconButton } from "@/components/admin/DeleteIconButton";

// Строка СКРЫТОГО этапа (активные — см. RoundStageList.tsx, там же
// перетаскивание). У скрытых позиции в видимом списке нет, поэтому здесь
// только переименование/число и возврат в список — без drag (как и
// CategoryRow.tsx для скрытых категорий).
export function RoundStageRow({
  stageId,
  name: initialName,
  defaultAdvanceCount: initialCount,
}: {
  stageId: string;
  name: string;
  defaultAdvanceCount: number;
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

  async function unhide() {
    setLoading(true);
    await fetch(`/api/round-stages/${stageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: true }),
    });
    setLoading(false);
    router.refresh();
  }

  const fieldClass =
    "!w-auto border-admin-border bg-admin-card2 py-1 text-sm text-night-text focus:border-admin-primary focus:ring-admin-primary/20";

  if (editing) {
    return (
      <tr className="border-t border-admin-border bg-admin-card2/40">
        <td className="px-3 py-2 align-middle" />
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
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={loading}
              onClick={() => setEditing(false)}
              className="border-admin-border bg-transparent text-night-text hover:bg-admin-card"
            >
              Отмена
            </Button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr onClick={() => setEditing(true)} className="cursor-pointer border-t border-admin-border transition-colors hover:bg-admin-card2/50">
      <td className="px-3 py-2.5 align-middle" />
      <td className="px-3 py-2.5 align-middle text-sm font-medium text-admin-muted">{initialName}</td>
      <td className="px-3 py-2.5 align-middle text-sm text-admin-muted">{initialCount}</td>
      <td className="px-3 py-2.5 align-middle">
        <StatusBadge label="Скрыта" variant="neutral" />
      </td>
      <td className="px-3 py-2.5 align-middle" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-3">
          <button type="button" onClick={() => setEditing(true)} title="Редактировать" aria-label={`Редактировать этап ${initialName}`} className="text-admin-muted hover:text-night-text">
            <PencilIcon />
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={unhide}
            title="Вернуть в список"
            className="text-xs text-admin-disabled hover:text-admin-muted hover:underline"
          >
            вернуть
          </button>
          <DeleteIconButton
            url={`/api/round-stages/${stageId}`}
            confirmMessage={`Удалить этап «${initialName}»? Это необратимо.`}
            label={`Удалить этап ${initialName}`}
          />
        </div>
      </td>
    </tr>
  );
}
