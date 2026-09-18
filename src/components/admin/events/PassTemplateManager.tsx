"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PassFormModal, type PassCommonFormValues } from "./PassFormModal";

const PASS_TYPE_LABELS: Record<string, string> = {
  FULL_PASS: "Full Pass",
  PARTY_PASS: "Party Pass",
  WORKSHOP_PASS: "Workshop Pass",
  DAY_PASS: "Day Pass",
  COMPETITION_PASS: "Competition Pass",
  VIP_PASS: "VIP Pass",
  FREE_PASS: "Free Pass",
  CUSTOM: "Другое",
};

export type PassTemplateRow = {
  id: string;
  name: string;
  description: string | null;
  type: string;
  price: number | null;
  currency: string | null;
  quantity: number | null;
  imageUrl: string | null;
  allowMultipleEntry: boolean;
};

// Шаблоны Pass организатора (2026-09-18, по прямому запросу пользователя —
// "везде один и тот же экран") — переиспользует PassFormModal.tsx в
// scope="template" (тот же компонент, что и у "настоящего" Pass события и у
// "Добавить Pass" в EventTemplateEditor.tsx), вместо прежней компактной
// inline-формы прямо в строке карточки. onSubmit делает реальный fetch на
// /api/pass-templates (в отличие от EventTemplateEditor, где шаблон целиком
// сохраняется одной кнопкой) — при ошибке бросает Error, модалка это ловит
// и показывает сообщение, не закрываясь (см. комментарий у PassFormModal).
export function PassTemplateManager({ templates: initialTemplates }: { templates: PassTemplateRow[] }) {
  const router = useRouter();
  const [templates, setTemplates] = useState(initialTemplates);
  const [editing, setEditing] = useState<PassTemplateRow | "new" | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(values: PassCommonFormValues) {
    const editingId = editing !== "new" && editing ? editing.id : null;
    const url = editingId ? `/api/pass-templates/${editingId}` : "/api/pass-templates";
    const res = await fetch(url, {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.message || data.error || "Не удалось сохранить шаблон.");
    }
    if (editingId) {
      setTemplates((prev) => prev.map((t) => (t.id === editingId ? data.template : t)));
    } else {
      setTemplates((prev) => [data.template, ...prev]);
    }
    router.refresh();
  }

  async function remove(id: string) {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/pass-templates/${id}`, { method: "DELETE" });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.message || data.error || "Не удалось удалить шаблон.");
      return;
    }
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button type="button" variant="admin" size="sm" onClick={() => setEditing("new")}>
          Новый шаблон
        </Button>
      </div>
      {error && <p className="m-0 text-xs text-red-400">{error}</p>}

      {templates.length === 0 ? (
        <p className="text-sm text-admin-muted">Шаблонов пока нет — создайте первый или сохраните существующий Pass как шаблон.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {templates.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3 rounded-app border border-admin-border bg-admin-card p-3">
              <div>
                <p className="m-0 font-medium text-night-text">{t.name}</p>
                <p className="m-0 text-xs text-admin-muted">
                  {PASS_TYPE_LABELS[t.type] ?? t.type}
                  {t.price != null ? ` · ${t.price} ${t.currency ?? ""}` : " · бесплатно"}
                  {t.quantity != null ? ` · ${t.quantity} мест` : ""}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button type="button" className="text-xs text-admin-muted hover:text-night-text hover:underline" onClick={() => setEditing(t)}>
                  Изменить
                </button>
                <button
                  type="button"
                  disabled={loading}
                  className="text-xs text-admin-muted hover:text-red-400 hover:underline"
                  onClick={() => remove(t.id)}
                >
                  Удалить
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing !== null && (
        <PassFormModal
          mode={editing === "new" ? "create" : "edit"}
          scope="template"
          initial={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onSubmit={save}
        />
      )}
    </div>
  );
}
