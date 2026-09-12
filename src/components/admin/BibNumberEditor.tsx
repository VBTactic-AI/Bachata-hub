"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Ручное изменение номера участника (вкладка "Участники", 2026-09-12, по
// прямому запросу пользователя) — клик по номеру превращает его в поле
// ввода; уникальность в рамках соревнования проверяет сервер
// (changeBibNumber, check-in.ts) — здесь только UI и понятная ошибка вместо
// молчаливого отказа.
export function BibNumberEditor({ registrationId, bibNumber }: { registrationId: string; bibNumber: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(bibNumber);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEdit() {
    setValue(bibNumber);
    setError(null);
    setEditing(true);
  }

  async function save() {
    const trimmed = value.trim();
    if (!trimmed || trimmed === bibNumber) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/registrations/${registrationId}/bib-number`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bibNumber: trimmed }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось изменить номер.");
      return;
    }
    setEditing(false);
    router.refresh();
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={startEdit}
        title="Изменить номер участника"
        className="rounded-app-sm px-1 py-0.5 font-extrabold tabular-nums transition-colors hover:bg-admin-card2"
      >
        №{bibNumber}
      </button>
    );
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <span className="inline-flex items-center gap-1">
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
            if (e.key === "Escape") setEditing(false);
          }}
          disabled={saving}
          className="w-16 rounded-app-sm border border-admin-border bg-admin-card2 px-1.5 py-0.5 text-sm tabular-nums text-night-text focus:border-admin-primary focus:outline-none"
        />
        <button type="button" onClick={save} disabled={saving} className="text-xs font-bold text-admin-primaryHover" aria-label="Сохранить номер">
          ✓
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={saving}
          className="text-xs font-bold text-admin-muted"
          aria-label="Отменить изменение номера"
        >
          ✕
        </button>
      </span>
      {error && <span className="max-w-[140px] whitespace-normal text-[11px] text-red-400">{error}</span>}
    </span>
  );
}
