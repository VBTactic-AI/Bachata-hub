"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { PencilIcon } from "@/components/admin/icons";
import { DeleteIconButton } from "@/components/admin/DeleteIconButton";

// Строка СКРЫТОГО критерия справочника (активные — см.
// JudgingCriterionList.tsx, там же перетаскивание). Редактирование доступно
// и здесь (по карандашу/клику), просто без drag — те же поля, что и у
// активного критерия.
export function JudgingCriterionRow({
  criterionId,
  name: initialName,
  minScore: initialMin,
  maxScore: initialMax,
}: {
  criterionId: string;
  name: string;
  minScore: number;
  maxScore: number;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ name: initialName, minScore: initialMin, maxScore: initialMax });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function save() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/judging-criteria/${criterionId}`, {
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
    setEditing(false);
    router.refresh();
  }

  async function unhide() {
    setLoading(true);
    await fetch(`/api/judging-criteria/${criterionId}`, {
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
        <td className="px-3 py-2 align-middle">
          <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={fieldClass} style={{ maxWidth: 180 }} autoFocus />
        </td>
        <td className="px-3 py-2 align-middle">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-admin-muted">от</span>
            <Input type="number" value={draft.minScore} onChange={(e) => setDraft({ ...draft, minScore: Number(e.target.value) })} className={fieldClass} style={{ maxWidth: 70 }} />
            <span className="text-xs text-admin-muted">до</span>
            <Input type="number" value={draft.maxScore} onChange={(e) => setDraft({ ...draft, maxScore: Number(e.target.value) })} className={fieldClass} style={{ maxWidth: 70 }} />
          </div>
          {error && <p className="m-0 mt-1 text-xs text-red-400">{error}</p>}
        </td>
        <td className="px-3 py-2 align-middle" colSpan={2}>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button type="button" size="sm" variant="admin" disabled={loading || !draft.name.trim() || draft.maxScore <= draft.minScore} onClick={save}>
              Сохранить
            </Button>
            <Button type="button" size="sm" variant="secondary" disabled={loading} onClick={() => setEditing(false)} className="border-admin-border bg-transparent text-night-text hover:bg-admin-card">
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
      <td className="px-3 py-2.5 align-middle text-sm text-admin-muted">
        {initialMin}–{initialMax}
      </td>
      <td className="px-3 py-2.5 align-middle">
        <StatusBadge label="Скрыт" variant="neutral" />
      </td>
      <td className="px-3 py-2.5 align-middle" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-3">
          <button type="button" onClick={() => setEditing(true)} title="Редактировать" aria-label={`Редактировать критерий ${initialName}`} className="text-admin-muted hover:text-night-text">
            <PencilIcon />
          </button>
          <button type="button" disabled={loading} onClick={unhide} title="Вернуть в список" className="text-xs text-admin-disabled hover:text-admin-muted hover:underline">
            вернуть
          </button>
          <DeleteIconButton
            url={`/api/judging-criteria/${criterionId}`}
            confirmMessage={`Удалить показатель «${initialName}»? Это необратимо.`}
            label={`Удалить показатель ${initialName}`}
          />
        </div>
      </td>
    </tr>
  );
}
