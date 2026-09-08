"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TrashIcon } from "@/components/admin/icons";

// Удаление одной записи справочника (Категории/Этапы отбора/Оценочные
// показатели) — по прямому запросу пользователя (2026-09-09), одинаковая
// иконка и поведение везде. Сервер сам отклоняет удаление уже используемой
// записи понятной ошибкой (CLAUDE.md §18 — история не теряется молча) —
// здесь только подтверждение (window.confirm, тот же приём, что уже
// используется в AchievementItem.tsx/UserBlockToggle.tsx) и вызов DELETE.
export function DeleteIconButton({ url, confirmMessage, label }: { url: string; confirmMessage: string; label: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onDelete() {
    if (!window.confirm(confirmMessage)) return;
    setLoading(true);
    setError(null);
    const res = await fetch(url, { method: "DELETE" });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось удалить.");
      return;
    }
    router.refresh();
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        disabled={loading}
        onClick={onDelete}
        title="Удалить"
        aria-label={label}
        className="text-admin-muted hover:text-red-400 disabled:opacity-50"
      >
        <TrashIcon />
      </button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </span>
  );
}
